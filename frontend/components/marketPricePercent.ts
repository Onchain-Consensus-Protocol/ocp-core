export function marketPricePercent(price:number):string{
 if(!Number.isFinite(price)||price<0||price>1)return '—';
 if(price>0&&price<.0001)return '<0.01%';
 if(price<1&&price>.9999)return '>99.99%';
 return (price*100).toFixed(2)+'%';
}
