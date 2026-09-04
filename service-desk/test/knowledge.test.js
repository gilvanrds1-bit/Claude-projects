/* Tests for the knowledge base lookup. Run: node test/knowledge.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mem = {};
const sandbox = {
  console,
  localStorage: {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  },
  window: {}
};
sandbox.window.localStorage = sandbox.localStorage;
vm.createContext(sandbox);
['config.js', 'store.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js', f), 'utf8'), sandbox, { filename: f }));

const Store = sandbox.window.Store;
Store.load();

let pass = 0, fail = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
}

/* Castor (1); Nunki (9). Answers keep their symbols exactly. */
Store.addKnowledge({ systemNo: 1, businessUnits: [1, 3], question: '4',  answer: 'A#7/2' });
Store.addKnowledge({ systemNo: 1, businessUnits: [1, 3], question: '11', answer: 'ZZ-04*' });
Store.addKnowledge({ systemNo: 1, businessUnits: [1],    question: '2',  answer: 'Q1' });
Store.addKnowledge({ systemNo: 1, businessUnits: [2, 4], question: '7',  answer: 'B/2' });
Store.addKnowledge({ systemNo: 9, businessUnits: [1, 3], question: '4',  answer: 'N-9' });

const ids = r => r.map(x => x.entry.question + ':' + x.entry.answer + ':' + x.match.kind);

console.log('\nexact combination');
check('Castor + {1,3} puts both exact answers first, in question order',
  ids(Store.queryKnowledge(1, [1, 3])).slice(0, 2),
  ['4:A#7/2:exact', '11:ZZ-04*:exact']);

console.log('\nranking');
const r = Store.queryKnowledge(1, [1, 3]);
check('entry needing only unit 1 is "covers", ranked below exact',
  ids(r)[2], '2:Q1:covers');
check('entry for units {2,4} shares nothing and is excluded',
  ids(r).some(s => s.startsWith('7:')), false);

console.log('\nquery narrower than the entry');
check('asking about unit 1 alone still surfaces the {1,3} entries as wider',
  ids(Store.queryKnowledge(1, [1])),
  ['2:Q1:exact', '4:A#7/2:wider', '11:ZZ-04*:wider']);

console.log('\npartial overlap');
Store.addKnowledge({ systemNo: 1, businessUnits: [3, 4], question: '9', answer: 'P%' });
check('{1,3} against an entry for {3,4} is a partial match',
  ids(Store.queryKnowledge(1, [1, 3])).filter(s => s.startsWith('9:')),
  ['9:P%:partial']);

console.log('\nsystem scoping');
check('Nunki has its own answer to question 4',
  ids(Store.queryKnowledge(9, [1, 3])), ['4:N-9:exact']);
check('searching every system returns both',
  Store.queryKnowledge('', [1, 3]).filter(x => x.entry.question === '4')
    .map(x => x.entry.systemName), ['Castor', 'Nunki']);

console.log('\nno units given');
check('listing everything recorded for Castor',
  Store.queryKnowledge(1, []).length, 5);

console.log('\nanswers are never reformatted');
check('symbols survive a round trip',
  Store.queryKnowledge(1, [1, 3])[0].entry.answer, 'A#7/2');

console.log('\nduplicates');
/* system + impacted units + question number is the key, and unit order
   must not matter */
const clash = Store.findDuplicate({
  id: 'not-saved', systemNo: 1, businessUnits: [3, 1], question: '4'
});
check('same system, same units in any order, same question clashes',
  clash && clash.answer, 'A#7/2');
check('a different question number does not clash',
  Store.findDuplicate({ id: 'not-saved', systemNo: 1, businessUnits: [1, 3], question: '5' }), null);
check('the same question against different units does not clash',
  Store.findDuplicate({ id: 'not-saved', systemNo: 1, businessUnits: [2, 4], question: '4' }), null);

console.log('\nquestion ordering');
check('2 sorts before 11, not after',
  ['11', '2', '10'].sort(Store.compareQuestion), ['2', '10', '11']);
check('lettered questions sort after numbered ones',
  ['Q3', '2'].sort(Store.compareQuestion), ['2', 'Q3']);

console.log('\nexport');
check('CSV carries an answer containing a comma intact',
  Store.knowledgeToCSV([Store.addKnowledge({
    systemNo: 2, businessUnits: [1], question: '1', answer: 'a,b "c"'
  })]).split('\n')[1].endsWith('"a,b ""c""",,' + Store.allKnowledge().slice(-1)[0].updatedAt), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
