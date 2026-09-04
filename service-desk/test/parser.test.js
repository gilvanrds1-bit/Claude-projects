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
System Name: Customer Billing (CIS)
System ID: CIS-30044821
Business Units: 1, 6 and 10
Answer Code: 2001
Priority: P2
Status: In progress
Reported by: L. Fernandes
Issue: Direct debit run rejected 400 accounts overnight
`, {
  systemNo: 5, systemId: 'CIS-30044821', businessUnits: [1, 6, 10],
  answerCode: '2001', priority: 'P2', status: 'In progress'
});

/* 2. A phone photo with the usual OCR slips: O for 0, l for 1, S for 5. */
run('OCR noise (O/l/S for digits)', `
System No: l9
System ID: NW-l2O94
Business Units: 2, 8
Answer Code: 3O1O
Priority: Pl
Issue: Depot link down since O6:00
`, {
  systemNo: 19, systemId: 'NW-12094', businessUnits: [2, 8], answerCode: '3010', priority: 'P1'
});

/* 3. No labels at all — everything has to be inferred. */
run('unlabelled scrawl', `
Maximo Asset Management
MX-20481
impacts Field Operations and Asset Management
closed 4010
`, {
  systemNo: 2, systemId: 'MX-20481', businessUnits: [2, 5], answerCode: '4010'
});

/* 4. Missing answer code — must be reported, never invented. */
const r4 = run('missing answer code', `
System No: 7
System ID: SN-4410023
Business Units: 8
Issue: Approvals queue stuck
`, { systemNo: 7, systemId: 'SN-4410023', businessUnits: [8] });
check('answerCode absent', r4.fields.answerCode, undefined);
check('flagged as missing', r4.missing, ['answerCode']);

/* 5. A year must not be mistaken for an answer code. */
const r5 = run('year is not an answer code', `
System No: 3
System ID: SC-4471
Business Units: 3
Logged 2026
`, { systemNo: 3 });
check('no answer code invented', r5.fields.answerCode, undefined);

/* 6. Number and name disagree — keep the number, raise a note. */
const r6 = run('conflicting system number and name', `
System No: 4
System Name: Salesforce CRM
System ID: GIS-88120
Business Units: 9
Answer Code: 5010
`, { systemNo: 4 });
check('conflict noted', r6.notes.length > 0, true);

/* 7. Out of range system number is rejected rather than stored. */
const r7 = run('system number out of range', `
System No: 47
System ID: FS-104233
Business Units: 6
Answer Code: 1001
`, {});
check('bad number not kept as 47', r7.fields.systemNo, 1);   /* backfilled from the FS id's system */

/* 8. Unknown four digit code is accepted but flagged. */
const r8 = run('unknown answer code', `
System No: 11
System ID: FM-60712
Business Units: 2
Answer Code: 7777
`, { answerCode: '7777' });
check('unknown code noted', r8.notes.some(n => /not in the code list/.test(n)), true);

/* 9. Named business units only, no numbers. */
run('business units by name', `
System No: 13
System ID: HR-40910
Business Units: People & HR, Finance
Answer Code: 1002
`, { businessUnits: [6, 7] });

/* 10. Free text summary with no Issue label. */
const r10 = run('summary without a label', `
System No: 20
System ID: PO-33418
Business Units: 2
Answer Code: 3001
Label printer at the northern depot jams on every third job
`, {});
check('summary picked up', /northern depot/.test(r10.fields.summary || ''), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
