/* Node test harness for the OCR text parser. Run: node test/parser.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {}, document: { createElement: () => ({ getContext: () => ({}) }) }, console, URL: {}, Image: function () {} };
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
['config.js', 'ocr.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js', f), 'utf8'), sandbox, { filename: f });
});

const CONFIG = sandbox.window.SDP_DEFAULT_CONFIG;
const OCR = sandbox.window.OCR;

let pass = 0, fail = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
}

function run(title, text, expect, opts) {
  const r = OCR.parse(text, CONFIG);
  console.log(`\n${title}  [${r.confidence}% of key fields, missing: ${r.missing.join(',') || 'none'}]`);
  Object.keys(expect).forEach(k => check(k, r.fields[k], expect[k]));
  if (opts && opts.show) console.log('   fields:', JSON.stringify(r.fields), '\n   notes:', r.notes);
  return r;
}

/* 1. A tidy printed ticket, read cleanly. */
run('tidy printed ticket', `
SERVICE DESK TICKET
Ticket No: SD-00421
Date: 03/09/2026
System No: 5
System Name: Sham
Configuration Item: SH-1
Business Units: 1, 6 and 10
Answer Code: 2001
Priority: P2
Status: In progress
Reported by: L. Fernandes
Issue: Direct debit run rejected 400 accounts overnight
`, {
  systemNo: 5, systemId: 'SH-1', businessUnits: [1, 6, 10],
  answerCode: '2001', priority: 'P2', status: 'In progress'
});

/* 2. A phone photo with the usual OCR slips: O for 0, l for 1, S for 5. */
run('OCR noise (O/l/S for digits)', `
System No: l2
Item Code: lZ-l
Business Units: 2, 8
Answer Code: 3O1O
Priority: Pl
Issue: Depot link down since O6:00
`, {
  systemNo: 12, systemId: 'IZ-1', businessUnits: [2, 8], answerCode: '3010', priority: 'P1'
});

/* 3. No labels at all — everything has to be inferred. */
run('unlabelled scrawl', `
Rastaban
RD-1
business units 2 and 5
closed 4010
`, {
  systemNo: 6, systemId: 'RD-1', businessUnits: [2, 5], answerCode: '4010'
});

/* 4. The code alone identifies the system. */
run('code only, no system number or name', `
CI: PD-1
Business Units: 4
Answer Code: 3020
`, { systemNo: 10, systemId: 'PD-1', businessUnits: [4], answerCode: '3020' });

/* 5. NN-1 and NN-2 are different systems and must never be confused. */
const nash = run('NN-2 is Nash', `
Item Code: NN-2
Business Units: 3
Answer Code: 1001
`, { systemNo: 4, systemId: 'NN-2' });
check('Nash not read as Nunki', nash.fields.systemNo, 4);

const nunki = run('NN-1 is Nunki', `
Item Code: NN-1
Business Units: 3
Answer Code: 1001
`, { systemNo: 9, systemId: 'NN-1' });
check('Nunki not read as Nash', nunki.fields.systemNo, 9);

/* 6. Knowing the system supplies the code, even when the photo lost it. */
run('system named, code missing from the photo', `
System No: 1
System Name: Castor
Business Units: 6
Answer Code: 5010
`, { systemNo: 1, systemId: 'CA-1' });

/* 7. Missing answer code — must be reported, never invented. */
const r7 = run('missing answer code', `
System No: 7
Item Code: PO-1
Business Units: 8
Issue: Approvals queue stuck
`, { systemNo: 7, systemId: 'PO-1', businessUnits: [8] });
check('answerCode absent', r7.fields.answerCode, undefined);
check('flagged as missing', r7.missing, ['answerCode']);

/* 8. A year must not be mistaken for an answer code. */
const r8 = run('year is not an answer code', `
System No: 3
Item Code: ZO-1
Business Units: 3
Logged 2026
`, { systemNo: 3, systemId: 'ZO-1' });
check('no answer code invented', r8.fields.answerCode, undefined);

/* 9. Code and system number disagree — keep both facts, raise a note. */
const r9 = run('code contradicts the system number', `
System No: 2
Item Code: TZ-1
Business Units: 9
Answer Code: 5010
`, {});
check('conflict noted', r9.notes.some(n => /belongs to system 14/.test(n)), true);

/* 10. Unknown four digit code is accepted but flagged. */
const r10 = run('unknown answer code', `
System No: 11
Item Code: MZ-1
Business Units: 2
Answer Code: 7777
`, { answerCode: '7777' });
check('unknown code noted', r10.notes.some(n => /not in the code list/.test(n)), true);

/* 11. Generic unit names must not tick every box. */
const r11 = run('generic unit names match on the number only', `
System No: 13
Item Code: EA-1
Business Units: 6 and 7
Answer Code: 1002
`, { businessUnits: [6, 7] });
check('no runaway unit match', r11.fields.businessUnits.length, 2);

/* 11b. Once units are named, the names are matched too. */
const named = { businessUnits: [
  { no: 1, name: 'Customer Operations', short: 'Cust Ops' },
  { no: 2, name: 'Field Operations', short: 'Field Ops' },
  { no: 3, name: 'Finance', short: 'Finance' }
]};
check('named units matched by name',
  OCR._internals.parseUnitList('Field Operations and Finance', named.businessUnits), [2, 3]);
check('unnamed units not matched by the word "unit"',
  OCR._internals.parseUnitList('business units', CONFIG.businessUnits), []);

/* 12. A system with no code recorded must still be loggable. */
const r12 = run('system with no code recorded', `
System No: 19
System Name: Mars
Business Units: 2
Answer Code: 3001
`, { systemNo: 19 });
check('no code invented', r12.fields.systemId, undefined);
check('code not treated as missing', r12.missing, []);

/* 13. Free text summary with no Issue label. */
const r13 = run('summary without a label', `
System No: 20
System Name: Neptune
Business Units: 2
Answer Code: 3001
Label printer at the northern depot jams on every third job
`, {});
check('summary picked up', /northern depot/.test(r13.fields.summary || ''), true);

/* 14. An unrecognised code is surfaced, not silently accepted. */
const r14 = run('code that is not in the list', `
System No: 1
Item Code: XX-9
Business Units: 1
Answer Code: 1001
`, {});
check('unknown item code noted', r14.notes.some(n => /not in the system list/.test(n)), true);

/* 15. What a real phone photo actually produced: the colon before the
       answer code read as a 1, and "4 and" ran together as "4and". */
run('lost colons and glued digits', `
System No :9
System Name : Nunki
Configuration Item : NN-1
Business Units :3,4and 9
Answer Code 12010
Priority :P2
Issue: Overnight extract did not reach the reporting store
`, {
  systemNo: 9, systemId: 'NN-1', businessUnits: [3, 4, 9],
  answerCode: '2010', priority: 'P2'
});

/* 16. A label line with no separator at all. */
run('label with no separator', `
System No 14
Item Code TZ-1
Business Units 5 and 6
Answer Code 4030
`, { systemNo: 14, systemId: 'TZ-1', businessUnits: [5, 6], answerCode: '4030' });

/* 17. A five digit run that contains no known code must not be trimmed
       into one — better to report nothing than to invent a code. */
const r17 = run('five digits, no known code inside', `
System No: 1
Item Code: CA-1
Business Units: 1
Answer Code: 87654
`, { systemNo: 1 });
check('no code fabricated from a long run', r17.fields.answerCode, undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
