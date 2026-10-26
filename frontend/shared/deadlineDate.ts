// Four-digit calendar years; also rejects present-day millisecond timestamps.
export const MAX_DEADLINE_SECONDS=253402300799;
export function validDeadlineTimestamp(value:unknown):value is number {
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=MAX_DEADLINE_SECONDS;
}
export function formatLocalDeadline(seconds:number):string {
 const d=new Date(seconds*1000),pad=(v:number)=>String(v).padStart(2,'0');
 return `${String(d.getFullYear()).padStart(4,'0')}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseLocalDeadline(value:string):number {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
 const seconds=new Date(value).getTime()/1000;
 // Reject invalid calendar dates and daylight-saving gaps instead of silently moving time.
 return validDeadlineTimestamp(seconds)&&formatLocalDeadline(seconds)===value?seconds:NaN;
}
export function defaultDeadlineLocal(nowMs=Date.now()):string {
 return formatLocalDeadline(Math.ceil((nowMs/1000+6*3600)/60)*60);
}
export function deadlineTimeZone(seconds:number):string {
 const date=new Date((validDeadlineTimestamp(seconds)?seconds:Date.now()/1000)*1000);
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const offset=new Intl.DateTimeFormat('en-US',{timeZoneName:'shortOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName')?.value??'';
 return `${zone} (${offset})`;
}
