import type { CsvTable } from '../csv.ts';
import { parseDate } from '../dates.ts';
import { parseCzk } from '../money.ts';
import { foldKey } from '../text.ts';
import type { Session, TrainingType } from '../types.ts';
import { isKnownTypo, normalizeCode } from './codes.ts';
import type { AddIssue } from './issues.ts';

export interface SessionsImport {
  sessions: Session[];
  rowsRead: number;
  excluded: number;
}

export function importSessions(
  table: CsvTable,
  trainingTypes: TrainingType[],
  addIssue: AddIssue
): SessionsImport {
  const knownCodes = new Set(trainingTypes.map((t) => t.code));
  const sessions: Session[] = [];
  let excluded = 0;

  for (const [index, row] of table.rows.entries()) {
    const id = (row.id_terminu ?? '').trim() || `řádek ${index + 2}`;
    const exclude = (type: string, message: string) => {
      excluded++;
      addIssue(id, type, 'error', `${message} Termín nelze použít.`);
    };

    const rawCode = (row.kod_skoleni ?? '').trim();
    const code = normalizeCode(rawCode);
    if (!knownCodes.has(code)) {
      exclude('neznamy-kod', `Neznámý kód školení „${rawCode}“.`);
      continue;
    }
    if (isKnownTypo(rawCode)) {
      addIssue(id, 'preklep-v-kodu', 'warning', `Kód „${rawCode}“ opraven na „${code}“ (překlep).`);
    }

    const date = parseDate(row.datum ?? '');
    if (!date.ok) {
      exclude('neplatne-datum', `Neplatné datum „${(row.datum ?? '').trim()}“.`);
      continue;
    }

    const capacity = Number((row.kapacita ?? '').trim());
    const booked = Number((row.obsazeno ?? '').trim() || '0');
    if (!Number.isInteger(capacity) || capacity < 0 || !Number.isInteger(booked) || booked < 0) {
      exclude(
        'neplatna-kapacita',
        `Nečitelná kapacita/obsazenost „${row.kapacita}“ / „${row.obsazeno}“.`
      );
      continue;
    }
    if (capacity === 0) {
      addIssue(id, 'nulova-kapacita', 'warning', 'Kapacita 0 – na termín nelze nikoho přihlásit.');
    }
    if (booked > capacity) {
      addIssue(
        id,
        'preplneno',
        'warning',
        `Obsazeno ${booked} z kapacity ${capacity} – termín je přeplněný, volná místa 0.`
      );
    }

    const price = parseCzk(row.cena_na_osobu ?? '');
    if (!price.ok || price.value === null) {
      addIssue(
        id,
        'chybi-cena',
        'info',
        `Chybí nebo nečitelná cena „${(row.cena_na_osobu ?? '').trim()}“ – náklady nelze spočítat.`
      );
    }

    const cancelled = foldKey(row.stav ?? '') === 'zruseno';
    const session: Session = {
      id,
      code,
      date: date.date,
      time: (row.cas ?? '').trim(),
      place: (row.misto ?? '').trim(),
      capacity,
      booked,
      priceCzk: price.ok ? price.value : null,
      cancelled,
      duplicateOf: null,
    };

    const original = sessions.find(
      (s) =>
        s.code === session.code &&
        s.date === session.date &&
        s.time === session.time &&
        s.place === session.place
    );
    if (original) {
      session.duplicateOf = original.id;
      addIssue(
        id,
        'duplicitni-termin',
        'warning',
        `Stejný termín jako ${original.id} (školení, datum, čas, místo) – počítán jen jednou.`
      );
    }
    sessions.push(session);
  }

  return { sessions, rowsRead: table.rows.length, excluded };
}
