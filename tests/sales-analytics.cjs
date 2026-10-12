const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
if(!process.argv.includes('--zone')){
  for(const TZ of ['Asia/Tokyo','America/Los_Angeles','UTC'])
    process.stdout.write(execFileSync(process.execPath,[__filename,'--zone'],{env:{...process.env,TZ}}));
}else{
  const window={};
  vm.runInNewContext(fs.readFileSync('sales-analytics.js','utf8'),{window,document:{addEventListener(){}},Date,console});
  const h=window.DrinkSalesHelpers;
  assert.equal(h.japanDay(Date.parse('2026-10-11T14:59:59Z')),'2026-10-11');
  assert.equal(h.japanDay(Date.parse('2026-10-11T15:00:00Z')),'2026-10-12');
  for(const [kind,start,end] of [['today','2026-10-12','2026-10-12'],['yesterday','2026-10-11','2026-10-11'],['week','2026-10-12','2026-10-12'],['month','2026-10-01','2026-10-12']]){
    const p=h.period(kind,Date.parse('2026-10-12T10:00:00Z'));assert.equal(p.start,start);assert.equal(p.end,end);
  }
  const csv=h.csv({start:'2026-10-12',end:'2026-10-12',generatedAt:'2026-10-12T01:00:00Z',csv:[{name:'=HYPERLINK("evil")',category:'不明',kind:'single',total:2,served:1,pending:1,key:'x'}]});
  assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));assert.ok(csv.includes('ワンドリンク'));
  console.log('PASS JST presets, midnight boundary and CSV escaping in '+process.env.TZ);
}
