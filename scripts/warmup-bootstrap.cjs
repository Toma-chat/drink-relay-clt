// Generates deployment SQL from the existing standard profile and official holiday CSV.
const fs = require('node:fs');
const vm = require('node:vm');
async function main() {
  const context = { window: {} }; vm.createContext(context);
  for (const file of ['store-config.js','unlimited-config.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context);
  const store = context.window.DRINK_RELAY_STORE_CONFIG.instanceId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const profile = context.window.DRINK_RELAY_UNLIMITED_CONFIG.planRules['unlimited-alcohol-all-day'];
  const response = await fetch('https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv');
  if(!response.ok) throw new Error('Official holiday download failed');
  const csv = new TextDecoder('shift_jis').decode(await response.arrayBuffer());
  const rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map(line=> {
    const match=line.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.+)$/);
    if(!match) throw new Error('Unexpected holiday format');
    return [`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,match[4]];
  });
  const year=Math.max(...rows.map(row=>Number(row[0].slice(0,4))));
  if(rows.filter(row=>row[0].startsWith(String(year))).length<16) throw new Error('Incomplete calendar');
  const q=value=>"'"+value.replaceAll("'","''")+"'";
  const sql=`begin;\ninsert into warmup_private.stores(id,profile,calendar_until) values(${q(store)},${q(JSON.stringify(profile))}::jsonb,'${year}-12-31') on conflict(id) do update set profile=excluded.profile,calendar_until=excluded.calendar_until;\ninsert into warmup_private.holidays(day,name) values\n${rows.map(row=>`(${q(row[0])},${q(row[1])})`).join(',\n')}\non conflict(day) do update set name=excluded.name;\nselect warmup_private.rollover();\ncommit;\n`;
  fs.writeFileSync('supabase/warmup-bootstrap.sql',sql);
  console.log(`Generated calendar through ${year}-12-31; profile referenced from unlimited-config.js`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
