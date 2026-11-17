/** Display time-derived status without pretending a settlement transaction has executed. */
export function marketStageLabel(phase:string,now:number,genesisCutoff:number,formalCutoff:number,coreCutoff:number,zh:boolean,earlyDue=false):string{
 const t=(cn:string,en:string)=>zh?cn:en;
 if(phase==='CREATE')return t('待创建','Not created');
 if(phase==='FAILED')return t('毕业失败 · 可退款','Funding failed · Refunds available');
 if(phase==='SETTLED')return t('已结算 · 可领取','Settled · Claims available');
 if(phase==='GENESIS')return now>=genesisCutoff?t('毕业失败 · 待清算','Funding failed · Settlement needed'):t('Genesis · 交易中','Genesis · Trading open');
 if(earlyDue)return t('提前结算 · 待处理','Early settlement · Action needed');
 if(phase==='FORMAL'||phase==='WAIT_CORE'){
  if(now>=coreCutoff)return t('Core 已截止 · 待结算','Core ended · Settlement needed');
  if(phase==='WAIT_CORE'||now>=formalCutoff)return t('交易已截止 · Core 进行中','Trading ended · Core open');
  return t('正式市场 · 交易中','Formal · Trading open');
 }
 return t('状态读取中','Loading status');
}
