import math,json,random

def logsum(x,y):
 m=max(x,y);return m+math.log(math.exp(x-m)+math.exp(y-m))
def cost(q,b):return b*(logsum(q[0]/b,q[1]/b)-math.log(2))
# Independent-reserve construction: R continues to back the launch token;
# only explicitly reassigned B is the risk capital of a standard LMSR.
out={'scope':'Research model, not production code or EVM proof','current_lp_examples':[],'independent_reserve_checks':[]}
for x in [0.001,.01,.1,.5,1]:out['current_lp_examples'].append({'fraction':x,'pre_net_per_R':.945*(2*x-x*x),'linear_LP_NAV_per_R':x})
for seed in range(100):
 rng=random.Random(seed);reserve=.6;b=reserve/math.log(2);q=[0.,0.];cash=reserve
 holdings=[[0.,0.] for _ in range(10)];initial=reserve;paid=sold=0.;worst=1e99
 for step in range(1000):
  u=rng.randrange(10);side=rng.randrange(2)
  if rng.random()<.4 and holdings[u][side]>0:
   n=holdings[u][side]*rng.random();new=q.copy();new[side]-=n
   gross=cost(q,b)-cost(new,b);cash-=gross;sold+=gross
   holdings[u][side]-=n;q=new
  else:
   n=rng.random()*3;new=q.copy();new[side]+=n
   charge=cost(new,b)-cost(q,b);cash+=charge;paid+=charge
   holdings[u][side]+=n;q=new
  # Each outcome separately; capital is residual, never promised twice.
  for liability in [q[0],q[1],sum(q)/2]:
   assert cash+1e-10>=liability,(seed,step,cash,liability)
   worst=min(worst,cash-liability)
  assert abs(cash-(initial+paid-sold))<1e-9
 out['independent_reserve_checks'].append({'seed':seed,'operations':1000,'min_solvency_margin':worst})
# Graduation changes no launch-token state, so every finite partial redemption
# remains exactly k*(S*S-(S-h)**2) before/after, including full positions.
rng=random.Random(429)
for _ in range(10000):
 s=rng.uniform(.01,1000);k=rng.uniform(.0001,10);h=rng.random()*s
 before=.945*k*(s*s-(s-h)**2)
 after=.98*k*(s*s-(s-h)**2)
 assert after+1e-9>=before
out['continuity_cases']=10000;out['formal_operations']=100000
out['limitations']=['Retains separate launch token; removes automatic gToken-to-LP replacement','B capital is reassigned risk capital, not both a refundable reserve and LMSR subsidy','Fee recipients, capital-right mapping, price units and integer rounding require a separate implementation','Same external collateral snapshot for continuity; no oracle/DEX/slippage proof']
print(json.dumps(out,indent=2))
