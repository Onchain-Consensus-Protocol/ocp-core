import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {formatLocalDeadline,parseLocalDeadline,defaultDeadlineLocal,validDeadlineTimestamp} from './deadlineDate';
const inZone=(zone:string,code:string)=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`const h=await import(${JSON.stringify(new URL('./deadlineDate.ts',import.meta.url).href)}); console.log(JSON.stringify(${code}));`],{env:{...process.env,TZ:zone},encoding:'utf8'}));
describe('calendar deadline conversion',()=>{
 it('formats local calendar fields and round-trips minute precision',()=>{const seconds=Math.floor(Date.UTC(2026,9,26,12,30)/1000);expect(parseLocalDeadline(formatLocalDeadline(seconds))).toBe(seconds);expect(parseLocalDeadline(defaultDeadlineLocal(seconds*1000))).toBe(seconds+21600);});
 it('rejects invalid dates, seconds, UTC offsets and milliseconds as epoch seconds',()=>{for(const value of ['','2026-02-30T10:00','2026-13-01T10:00','2026-10-26T10:00:30','2026-10-26T10:00Z','2026-10-26T10:00+08:00'])expect(parseLocalDeadline(value)).toBeNaN();expect(validDeadlineTimestamp(Date.now())).toBe(false);});
 it('interprets local Shanghai and UTC input as the correct different UTC instants',()=>{expect(inZone('Asia/Shanghai',"h.parseLocalDeadline('2026-10-26T18:30')")).toBe(Date.UTC(2026,9,26,10,30)/1000);expect(inZone('UTC',"h.parseLocalDeadline('2026-10-26T18:30')")).toBe(Date.UTC(2026,9,26,18,30)/1000);});
 it('rejects nonexistent DST times and exposes the chosen offset for repeated times',()=>{expect(inZone('America/New_York',"h.parseLocalDeadline('2026-03-08T02:30')")).toBeNull();expect(inZone('America/New_York',"h.parseLocalDeadline('2026-03-08T03:30')")).toBe(Date.UTC(2026,2,8,7,30)/1000);expect(inZone('America/New_York',"h.deadlineTimeZone(h.parseLocalDeadline('2026-11-01T01:30'))")).toContain('GMT-4');});
});
