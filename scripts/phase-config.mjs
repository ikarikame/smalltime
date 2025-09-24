import { Helpers, ST_Config } from './helpers.mjs';

// Export a factory that returns an appropriate PhaseConfig class. This delays
// binding to the Foundry Application API until runtime so we can prefer the
// V2 Application classes when they're available and avoid constructing a V1
// Application at import time (which triggers compatibility warnings).
export function createPhaseConfigClass() {
  const Base = foundry?.applications?.api?.FormApplicationV2 || FormApplication;

  return class PhaseConfig extends Base {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'smalltime-phase-config',
      title: game.i18n.localize('SMLTME.Phase_Config_Title') || 'Configure Day Phases',
      template: 'modules/smalltime/templates/phase-config.html',
      width: 520,
      closeOnSubmit: true,
    });
  }

  constructor(...args) {
    super(...args);
  }

  /** Get the data to populate the template. */
  async getData() {
    const raw = ST_Config.getDayPhases();
    const phases = raw.map((p, idx) => {
      const name = p.name || (p.key ? (game?.i18n ? game.i18n.localize(p.key) : p.key) : `Phase ${idx+1}`);
      const start = Number.isInteger(p.start) ? p.start : 0;
      const end = Number.isInteger(p.end) ? p.end : 1440;
      // Format times as HH:MM for input[type=time]. HTML time can't represent 24:00, so show 23:59 for 1440.
      const minutesToTime = (m) => {
        if (m >= 1440) m = 1439;
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      };
      return { ...p, name, id: idx, startTime: minutesToTime(start), endTime: minutesToTime(end), first: idx === 0, last: false };
    });

    // Mark the last phase
    if (phases.length) phases[phases.length - 1].last = true;

    // Force first start to 00:00 and last end to 23:59 in the data presented by the form
    if (phases.length) phases[0].startTime = '00:00';
    if (phases.length) phases[phases.length - 1].endTime = '23:59';

    // Provide localized labels for the template (avoid requiring a Handlebars helper)
    const phaseNameLabel = game.i18n.localize('SMLTME.Phase.Name') || 'Phase Name';
    const phaseStartLabel = game.i18n.localize('SMLTME.Phase.Start') || 'Start (minutes)';
    const phaseEndLabel = game.i18n.localize('SMLTME.Phase.End') || 'End (minutes)';
    const removeText = game.i18n.localize('SMLTME.Remove') || 'Remove';
    const addText = game.i18n.localize('SMLTME.Phase_Add') || 'Add Phase';
    const saveText = game.i18n.localize('SMLTME.Save') || 'Save';
  const resetText = game.i18n.localize('SMLTME.Reset') || 'Reset Defaults';
    const newPhasePlaceholder = game.i18n.localize('SMLTME.Phase_New_Placeholder') || 'New phase';

    return { phases, phaseNameLabel, phaseStartLabel, phaseEndLabel, removeText, addText, saveText, resetText, newPhasePlaceholder };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const minutesToTime = (m) => {
      if (m >= 1440) m = 1439;
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    html.find('.phase-add').click(() => {
      const phases = this.element.find('.phase-row');
      const newIndex = phases.length;
      const newRow = $(
        `<div class="phase-row" data-id="${newIndex}">
          <input type="text" class="phase-name" placeholder="${game.i18n.localize('SMLTME.Phase_New_Placeholder') || 'New phase'}"/>
          <input type="time" class="phase-start" value="${minutesToTime(0)}" />
          <input type="time" class="phase-end" value="${minutesToTime(1440)}" />
          <button type="button" class="phase-remove" title="${game.i18n.localize('SMLTME.Remove') || 'Remove'}" aria-label="${game.i18n.localize('SMLTME.Remove') || 'Remove'}"><i class="fas fa-times"></i></button>
        </div>`
      );
      this.element.find('.phases-list').append(newRow);
  this.element.find('.phase-remove').off('click').on('click', (ev) => this._onRemove(ev));

  // After adding, ensure previous last row's end input is enabled and new row is marked as last
  const $rows = this.element.find('.phase-row');
  $rows.find('.phase-end').prop('disabled', false);
  $rows.find('.phase-start').first().prop('disabled', true);
  $rows.last().find('.phase-end').prop('disabled', true);
    });

    this.element.find('.phase-remove').off('click').on('click', (ev) => this._onRemove(ev));

    // Reset to module defaults (and persist to world settings)
    html.find('.phase-reset').off('click').on('click', async (ev) => {
      if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize('SMLTME.Must_Be_GM') || 'Only GMs can reset defaults');
      // Use the module's DefaultDayPhases and localize names
      const defaults = ST_Config.DefaultDayPhases.map((p) => ({ ...p, name: game?.i18n ? game.i18n.localize(p.key) : p.key }));
      await game.settings.set('smalltime', 'day-phases', defaults);
      ui.notifications.info(game.i18n.localize('SMLTME.Phase_Config_Reset') || 'Day phases reset to defaults');
      // Re-render the form with the defaults
      this.render(true);
    });

    // Ensure first start and last end inputs disabled state is correct on load
    const $rows = this.element.find('.phase-row');
    $rows.find('.phase-start').first().prop('disabled', true);
    $rows.find('.phase-end').prop('disabled', false);
    $rows.last().find('.phase-end').prop('disabled', true);
  }

  _onRemove(ev) {
    const $row = $(ev.currentTarget).closest('.phase-row');
    // Allow removal, then reapply first/last disabled constraints
    $row.remove();
    const $rows = this.element.find('.phase-row');
    if ($rows.length) {
      $rows.find('.phase-start').prop('disabled', false);
      $rows.find('.phase-start').first().prop('disabled', true);
      $rows.find('.phase-end').prop('disabled', false);
      $rows.last().find('.phase-end').prop('disabled', true);
    }
  }

  async _updateObject(event, formData) {
    // Collect the rows into an array
    const phases = [];
    this.element.find('.phase-row').each((i, el) => {
      const $el = $(el);
      const name = $el.find('.phase-name').val() || `Phase ${i+1}`;
      const startRaw = $el.find('.phase-start').val();
      const endRaw = $el.find('.phase-end').val();
      const timeToMinutes = (t) => {
        if (!t) return 0;
        // Handle both 'HH:MM' and numeric minutes
        if (typeof t === 'string' && t.indexOf(':') !== -1) {
          const parts = t.split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          return h * 60 + m;
        }
        return parseInt(t, 10) || 0;
      };
  // First row start is forced to 0 regardless of input
  let start = i === 0 ? 0 : timeToMinutes(startRaw);
  // Last row end is forced to 1440 (we display 23:59 but persist as 1440)
  const isLast = $el.is(':last-child');
  let end = isLast ? 1440 : timeToMinutes(endRaw);
      // If the end is 23:59 (1439) and this is intended to be full day, we'll normalize later.
      phases.push({ name, start, end });
    });

    // Validate numeric ranges first - note first.start==0 and last.end==1440 are enforced
    for (const p of phases) {
      if (isNaN(p.start) || isNaN(p.end) || p.start < 0 || p.end > 1440 || p.start >= p.end) {
        return ui.notifications.error(game.i18n.localize('SMLTME.Phase_Config_Error') || 'Invalid phase times');
      }
    }

    // Sort by start time
    phases.sort((a, b) => a.start - b.start);

    // Enforce contiguity and non-overlap: adjust small gaps/overlaps.
    let adjusted = false;
    // Ensure first starts at 0 (enforced)
    if (phases.length && phases[0].start !== 0) {
      adjusted = true;
      phases[0].start = 0;
    }

    for (let i = 1; i < phases.length; i++) {
      const prev = phases[i - 1];
      const cur = phases[i];
      if (cur.start < prev.end) {
        // overlap: move prev.end back to cur.start to remove overlap if possible
        adjusted = true;
        // Choose to shrink previous end to current start to remove overlap
        prev.end = cur.start;
        // If prev ended up invalid, instead set cur.start to prev.end (rollback)
        if (prev.start >= prev.end) {
          // rollback and set cur.start to prev.end (best-effort)
          prev.end = cur.start; // keep as-is
          cur.start = prev.end;
        }
      } else if (cur.start > prev.end) {
        // gap: close the gap by setting cur.start == prev.end
        adjusted = true;
        cur.start = prev.end;
      }
      // Ensure ordering invariant: cur.start < cur.end
      if (cur.start >= cur.end) {
        return ui.notifications.error(game.i18n.localize('SMLTME.Phase_Config_Error') || 'Invalid phase times after adjustments');
      }
    }

    // Ensure last ends at 1440 (enforced)
    if (phases.length) {
      const last = phases[phases.length - 1];
      if (last.end !== 1440) {
        adjusted = true;
        last.end = 1440;
      }
    }

    if (adjusted) {
      ui.notifications.info(game.i18n.localize('SMLTME.Phase_Config_Adjusted') || 'Phase times adjusted to be contiguous and non-overlapping');
    }

  // Persist phases. Use integer minutes with last.end = 1440 to represent end of day.
  await game.settings.set('smalltime', 'day-phases', phases);
    ui.notifications.info(game.i18n.localize('SMLTME.Phase_Config_Saved') || 'Day phases saved');
  }
  };
}
