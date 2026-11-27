import asyncio,edge_tts,os,json,hashlib,sys
S=sys.argv[1];px=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
plan=json.load(open(f'{S}/audio/plan.json'))
texts=sorted({x[1] for a in plan.values() for x in a if x[0]=='t'})
os.makedirs(f'{S}/audio/seg',exist_ok=True)
def fn(t):return f'{S}/audio/seg/'+hashlib.md5(t.encode()).hexdigest()+'.mp3'
sem=asyncio.Semaphore(8);done=0;fail=[]
async def one(t):
    global done
    f=fn(t)
    if os.path.exists(f) and os.path.getsize(f)>1000: done+=1;return
    async with sem:
        for k in range(4):
            try:
                await edge_tts.Communicate(t,'vi-VN-NamMinhNeural',proxy=px).save(f+'.tmp')
                if os.path.getsize(f+'.tmp')>1000: os.replace(f+'.tmp',f);done+=1;return
            except Exception as e: await asyncio.sleep(1+k*2)
        fail.append(t)
async def main():
    await asyncio.gather(*[one(t) for t in texts])
asyncio.run(main());print('done',done,'of',len(texts),'fail',len(fail))
