# Generated process model interpreter. SimPy advances virtual time; the ordered
# calendar makes completion/process/arrival priorities explicit across exports.
import heapq
import math
import statistics
import simpy

def run_model(model, config, seed):
    env = simpy.Environment()
    nodes = {n['id']: n for n in model['nodes']}
    def cycle_base(p,t):
        q=t/p;r=round(q)
        return (r if abs(q-r)<=2.220446049250313e-16*max(1,abs(q))*4 else math.floor(q))*p
    def capacity(c,t):
        if not c.get('schedule'): return c.get('capacity',0)
        schedule=c['schedule'];base=cycle_base(schedule['period'],t)
        return next((i['capacity'] for i in schedule['intervals'] if base+i['start']<=t<base+i['end']),schedule['outsideCapacity'])
    def next_shift(c,t):
        sc=c['schedule'];p=sc['period'];base=cycle_base(p,t)
        bounds=[0,p]+[v for i in sc['intervals'] for v in (i['start'],i['end'])]
        return min([base+x for x in bounds if base+x>t]+[base+p+min(x for x in bounds if x>0)])
    state = {k: dict(queue=[], busy=0, stock=n['config'].get('initial', 0), generated=0,
                     completed=0, capacity=capacity(n['config'],0), areaCapacity=0., areaUsed=0., areaOvertime=0., areaQ=0., areaBusy=0., areaStock=0., maxQ=0,
                     demand=0., fulfilled=0., cost=0., revenue=0.) for k,n in nodes.items()}
    outputs = {(e['sourceId'],e.get('port','out')): (e['targetId'],e.get('targetPort','in')) for e in model['edges'] if e['kind']=='entityFlow'}
    calendar, jobs = [], []
    sequence, time, random_state = 0, 0., seed
    horizon, warmup = config['horizon'], config['warmup']
    if not (horizon > 0 and 0 <= warmup < horizon): raise ValueError('Invalid observation window')
    def random():
        nonlocal random_state
        random_state = (random_state + 0x6D2B79F5) & 0xffffffff
        t = random_state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    def sample(d):
        u = lambda: max(2.220446049250313e-16, min(1-2.220446049250313e-16, random()))
        k=d['kind']
        if k=='constant': return d['value']
        if k=='exponential': return -math.log(1-u())*d['mean']
        if k=='uniform': return d['min']+u()*(d['max']-d['min'])
        if k=='discreteUniform': return d['min']+math.floor(u()*(d['max']-d['min']+1))
        if k=='triangular':
            x=u(); a,b,c=d['min'],d['max'],d['mode']
            return a+math.sqrt(x*(b-a)*(c-a)) if x<(c-a)/(b-a) else b-math.sqrt((1-x)*(b-a)*(b-c))
        if k=='normal':
            for _ in range(10000):
                v=d['mean']+d['stddev']*math.sqrt(-2*math.log(u()))*math.cos(2*math.pi*u())
                if d.get('nonnegativePolicy')=='truncate': return max(0,v)
                if v>=0: return v
            raise ValueError('Normal distribution rejection limit')
        raise ValueError('Unsupported distribution '+k)
    def value(v,j):
        k=v['kind']
        if k=='constant': return v['value']
        if k=='quantity': return j['quantity']
        if k=='stock': return state[v['nodeId']]['stock']
        if k=='available': return max(0,state[v['nodeId']]['capacity']-state[v['nodeId']]['busy'])
        if k=='attribute': return j['attributes'][v['name']]
        if k=='add': return value(v['left'],j)+value(v['right'],j)
        if k=='multiply': return value(v['left'],j)*value(v['right'],j)
        if k=='subtract': return value(v['left'],j)-value(v['right'],j)
        raise ValueError('Unknown expression')
    def condition(c,j):
        a,b=value(c['left'],j),value(c['right'],j)
        return {'<':a<b,'<=':a<=b,'==':a==b,'>':a>b,'>=':a>=b}[c['operator']]
    def schedule(kind,node,t,job=None,port=None):
        nonlocal sequence
        if not math.isfinite(t) or t<time: raise ValueError('Invalid event time')
        priority=-1 if kind=='shift' else 0 if kind=='end' else 2 if kind=='source' else 1
        heapq.heappush(calendar,(t,priority,sequence,kind,node,job,port)); sequence+=1
    def new_job(quantity,attributes=None,entity_type="Entity",synthetic=False):
        if not math.isfinite(quantity) or quantity<0: raise ValueError('Invalid entity quantity')
        j=dict(id=len(jobs)+1,quantity=quantity,attributes=dict(attributes or {}),entity_type=entity_type,synthetic=synthetic,retired=False,frames=[],arrival=time,wait=0.,service=0.,started=time,departure=None)
        jobs.append(j); return j
    def route(node,j,port='out'):
        dest,input_port=outputs[(node,port)];schedule('enter',dest,time,j,input_port)
    def finish(j):
        if j['retired']: return
        j['retired']=True
        if j['synthetic']:
            for member in j.get('members',[]): member['wait']+=j['wait'];member['service']+=j['service'];finish(member)
        else: j['departure']=time
    def priority(k,j):
        c=nodes[k]['config']
        return j['attributes'].get(c.get('priorityAttribute','priority'),0) if c['kind']=='server' and c.get('queueDiscipline')=='priority' else 0
    def enqueue(k,j,port):
        nonlocal sequence
        s=state[k];s['queue'].append((j,time,sequence,port));sequence+=1
        if nodes[k]['config'].get('queueDiscipline')=='priority':s['queue'].sort(key=lambda w:(-priority(k,w[0]),w[2]))
    def integrate(t):
        nonlocal time
        dt=max(0,min(t,horizon)-max(time,warmup))
        for k,s in state.items():
            c=nodes[k]['config'];pool=state[c['resourceId']] if c['kind']=='server' and c.get('resourceId') else s
            s['areaCapacity']+=pool['capacity']*dt
            s['areaUsed']+=s['busy']*(pool['capacity']/pool['busy'] if pool['busy']>pool['capacity'] and pool['busy']>0 else 1)*dt
            s['areaOvertime']+=max(0,s['busy']-pool['capacity'])*dt
            s['areaQ']+=len(s['queue'])*dt; s['areaBusy']+=s['busy']*dt; s['areaStock']+=s['stock']*dt
        time=t
    def pump():
        changed=False; blocked=set()
        heads=sorted((k for k in nodes if state[k]['queue']),key=lambda k:(-priority(k,state[k]['queue'][0][0]),state[k]['queue'][0][2]))
        for k in heads:
            c,s=nodes[k]['config'],state[k]; j,at,_,_=s['queue'][0]
            if c['kind']=='batch':
                groups=[[x for x in s['queue'] if not c.get('matchAttribute') or x[0]['attributes'][c['matchAttribute']]==w[0]['attributes'][c['matchAttribute']]] for w in s['queue']]
                group=next((g for g in groups if len(g)>=c['size']),None)
                if group is None:continue
                chosen=group[:c['size']];ids={x[2] for x in chosen};s['queue']=[x for x in s['queue'] if x[2] not in ids]
                for x in chosen:x[0]['wait']+=time-x[1]
                carrier=new_job(sum(x[0]['quantity'] for x in chosen),chosen[0][0]['attributes'],'Batch',True);carrier['members']=[x[0] for x in chosen]
                s['completed']+=1;route(k,carrier);return True
            if c['kind']=='join':
                pair=next(((a,b) for a in s['queue'] for b in s['queue'] if a[3]!=b[3] and a[0]['frames'][-1]==b[0]['frames'][-1]),None)
                if pair is None:continue
                a,b=pair if pair[0][3]=='a' else pair[::-1];ids={a[2],b[2]};s['queue']=[x for x in s['queue'] if x[2] not in ids]
                a[0]['wait']+=time-a[1];b[0]['wait']+=time-b[1];finish(b[0]);a[0]['frames'].pop();s['completed']+=1;route(k,a[0]);return True
            if c['kind']=='server':
                key=c.get('resourceId') or k; pool=state[key]; capacity=pool['capacity']
                if key in blocked or pool['busy']>=capacity: blocked.add(key); continue
                s['queue'].pop(0);s['busy']+=1
                if pool is not s: pool['busy']+=1
                j['wait']+=time-at;j['started']=time
                schedule('end',k,time+sample(c['serviceDistribution']),j);return True
            elif c['kind']=='stock':
                store=state[c['storeId']];amount=value(c['amount'],j)
                if not math.isfinite(amount) or amount<0: raise ValueError('Invalid stock amount')
                if c['operation']=='take' and (c['storeId'] in blocked or store['stock']<amount): blocked.add(c['storeId']);continue
                s['queue'].pop(0);j['wait']+=time-at
                actual=min(store['stock'],amount) if c['operation']=='fulfill' else amount
                store['stock']+=actual if c['operation']=='put' else -actual
                if warmup<=time<=horizon:
                    s['demand']+=amount;s['fulfilled']+=actual;s['cost']+=actual*c['unitCost'];s['revenue']+=actual*c['unitRevenue']
                s['completed']+=1;route(k,j);return True
        return changed
    for k,n in nodes.items():
        c=n['config']
        if c['kind']=='source':
            t=c.get('startTime',0)+sample(c['interarrivalDistribution'])
            if t<horizon and t<=c.get('endTime',math.inf) and c.get('arrivalLimit',math.inf)>0: schedule('source',k,t)
        elif c['kind']=='population': schedule('initial',k,0)
        elif c['kind']=='resource' and c.get('schedule'):schedule('shift',k,next_shift(c,0))
    def driver():
        nonlocal sequence
        steps=0
        while calendar:
            t,_,_,kind,k,j,port=heapq.heappop(calendar)
            if config.get('stopMode')=='horizon' and t>=horizon: break
            if config.get('stopMode')!='horizon' and kind=='shift' and t>=horizon and not any(e[3]!='shift' for e in calendar) and not any(n['config']['kind']=='server' and n['config'].get('resourceId') and state[key]['queue'] for key,n in nodes.items()):continue
            steps+=1
            if steps>config['maxEvents']: raise RuntimeError('Event limit reached; check cycles')
            yield env.timeout(max(0,t-env.now))
            integrate(t);c,s=nodes[k]['config'],state[k]
            if kind=='shift':
                s['capacity']=capacity(c,time)
                if time<horizon or any(e[3]!='shift' for e in calendar) or any(n['config']['kind']=='server' and n['config'].get('resourceId')==k and state[key]['queue'] for key,n in nodes.items()):schedule('shift',k,next_shift(c,time))
            elif kind=='initial':
                for _ in range(c['count']): s['generated']+=1;route(k,new_job(c['quantity'],c.get('attributes'),c.get('entityType','Entity')))
            elif kind=='source':
                nxt=time+sample(c['interarrivalDistribution'])
                if nxt<horizon and nxt<=c.get('endTime',math.inf) and s['generated']+1<c.get('arrivalLimit',math.inf): schedule('source',k,nxt)
                j=new_job(sample(c['quantityDistribution']) if c.get('quantityDistribution') else 1,c.get('attributes'),c.get('entityType','Entity'));s['generated']+=1;route(k,j)
            elif kind=='end':
                s['busy']-=1;s['completed']+=1;j['service']+=time-j['started']
                if c['kind']=='server' and c.get('resourceId'): state[c['resourceId']]['busy']-=1
                route(k,j)
            elif c['kind'] in ('server','stock','batch','join'):
                if c['kind']=='batch' and c.get('matchAttribute') and c['matchAttribute'] not in j['attributes']:raise ValueError('Missing batch match attribute')
                if c['kind']=='join':
                    if not j['frames'] or port not in ('a','b'):raise ValueError('Join requires related Signal branches')
                    if any(w[3]==port and w[0]['frames'][-1]==j['frames'][-1] for w in s['queue']):raise ValueError('Duplicate Join branch')
                enqueue(k,j,port)
            elif c['kind']=='unbatch':
                if 'members' not in j:raise ValueError('Unbatch requires a batch')
                for member in j['members']:member['wait']+=j['wait'];member['service']+=j['service'];route(k,member)
                j['retired']=True;s['completed']+=1
            elif c['kind']=='assign':
                for a in c['assignments']:
                    v=value(a['value'],j)
                    if not math.isfinite(v):raise ValueError('Invalid attribute value')
                    j['attributes'][a['name']]=v
                route(k,j)
            elif c['kind']=='router':s['completed']+=1;route(k,j,'true' if random()<c['probability'] else 'false')
            elif c['kind']=='delay': s['busy']+=1;j['started']=time;schedule('end',k,time+sample(c['distribution']),j)
            elif c['kind']=='sink': finish(j);s['completed']+=1
            elif c['kind']=='decision': s['completed']+=1;route(k,j,'true' if all(condition(x,j) for x in c['conditions']) else 'false')
            elif c['kind']=='signal':
                child=new_job(value(c['quantity'],j),j['attributes'],j['entity_type']);correlation=sequence;sequence+=1;child['frames']=j['frames']+[correlation];j['frames'].append(correlation);s['generated']+=1;route(k,child,'spawn');route(k,j)
            else: raise ValueError('Entity entered invalid node')
            while pump(): pass
            for s in state.values(): s['maxQ']=max(s['maxQ'],len(s['queue']))
        if time<horizon: integrate(horizon)
    env.process(driver());env.run()
    duration=horizon-warmup; result={};cost=0.;revenue=0.
    for k,n in nodes.items():
        c,s=n['config'],state[k];kind=c['kind']
        periods=max(0,math.ceil(horizon/c.get('costPeriod',1))-math.floor(warmup/c.get('costPeriod',1)))
        if kind=='store':
            result[k+':stock']=s['stock'];result[k+':average']=s['areaStock']/duration
            x=s['areaStock']*c['holdingCost']+c['initial']*c['fixedCost']*periods;cost+=x;result[k+':cost']=x
        if kind=='resource':
            result[k+':utilization']=100*s['areaUsed']/s['areaCapacity'] if s['areaCapacity'] else 0
            x=s['areaCapacity']*c['costPerUnit']/c['costPeriod'] if c.get('schedule') else c['capacity']*c['costPerUnit']*periods;cost+=x;result[k+':cost']=x
            if c.get('schedule'):result[k+':staffed']=s['areaCapacity'];result[k+':overtime']=s['areaOvertime']
        if kind in ('server','stock','batch','join'): result[k+':queue']=s['areaQ']/duration;result[k+':waiting']=s['areaQ']
        if kind=='server': result[k+':utilization']=100*s['areaUsed']/s['areaCapacity'] if s['areaCapacity'] else 0
        if kind in ('batch','unbatch','join'):result[k+':completed']=s['completed']
        if kind=='delay':
            result[k+':active']=s['areaBusy']/duration
            if c.get('populationId'): result[k+':availability']=100*s['areaBusy']/duration/nodes[c['populationId']]['config']['count']
        if kind=='signal': result[k+':count']=s['generated']
        if kind=='stock':
            x=s['cost']+s['areaQ']*c['waitingCost'];cost+=x;revenue+=s['revenue'];result[k+':units']=s['fulfilled'];result[k+':cost']=x
            if c['operation']=='fulfill': result[k+':fill']=100*s['fulfilled']/s['demand'] if s['demand'] else 100;result[k+':lost']=s['demand']-s['fulfilled']
    result.update(cost=cost,revenue=revenue,balance=revenue-cost)
    if True:
        servers=[k for k in nodes if nodes[k]['config']['kind']=='server']
        done=[j for j in jobs if not j['synthetic'] and j['departure'] is not None and j['arrival']>=warmup]
        total_capacity=sum(nodes[nodes[k]['config'].get('resourceId') or k]['config']['capacity'] for k in servers) or 1
        result.update(totalArrivals=sum(not j['synthetic'] and j['arrival']>=warmup for j in jobs),totalDepartures=len(done),
            avgWaitTime=sum(j['wait'] for j in done)/(len(done) or 1),
            avgServiceTime=sum(j['service'] for j in done)/(len(done) or 1),
            avgSojournTime=sum(j['departure']-j['arrival'] for j in done)/(len(done) or 1),
            avgQueueLength=sum(state[k]['areaQ'] for k in servers)/duration,
            avgUtilization=sum(state[k]['areaUsed'] for k in servers)/(sum(state[k]['areaCapacity'] for k in {nodes[k]['config'].get('resourceId') or k for k in servers}) or 1),
            maxQueueLength=max([0]+[state[k]['maxQ'] for k in servers]),throughput=len(done)/duration)
    return result

def summarize(reps):
    table=[(1,12.706),(2,4.303),(3,3.182),(4,2.776),(5,2.571),(6,2.447),(7,2.365),(8,2.306),(9,2.262),(10,2.228),(12,2.179),(15,2.131),(20,2.086),(25,2.060),(30,2.042)]
    n=len(reps);critical=next((v for d,v in table if n-1<=d),1.96)
    result={}
    for k in reps[0]:
        vals=[r[k] for r in reps];mean=statistics.mean(vals);sd=statistics.stdev(vals) if n>1 else 0;half=critical*sd/math.sqrt(n)
        result[k]=dict(mean=mean,std=sd,lower=mean-half,upper=mean+half,n=n)
    return result

if __name__=='__main__':
    reps=[run_model(MODEL,CONFIG,(CONFIG['seed']+i*1000) % 4294967296) for i in range(CONFIG['replications'])]
    print(json.dumps(dict(unit=MODEL['unit'],replications=reps,summary=summarize(reps)),ensure_ascii=False))
