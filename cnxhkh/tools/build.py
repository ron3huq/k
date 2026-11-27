import json,hashlib,subprocess,sys,os
S=sys.argv[1];A=f'{S}/audio';plan=json.load(open(f'{A}/plan.json'))
for sec in ['1','1.2','1.5','3']:
    f=f'{A}/sil{sec}.mp3'
    if not os.path.exists(f):subprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','anullsrc=r=24000:cl=mono','-t',sec,'-b:a','48k',f],check=True)
os.makedirs(f'{A}/out',exist_ok=True)
for ch,segs in sorted(plan.items(),key=lambda x:int(x[0])):
    lst=f'{A}/list{ch}.txt'
    with open(lst,'w') as o:
        for k,v in segs:
            p=f'{A}/seg/'+hashlib.md5(v.encode()).hexdigest()+'.mp3' if k=='t' else f'{A}/sil{v}.mp3'
            o.write(f"file '{p}'\n")
    out=f'{A}/out/chuong{ch}.mp3'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',lst,'-ac','1','-ar','24000','-b:a','24k',out],check=True)
    d=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',out],capture_output=True,text=True).stdout.strip()
    print(ch,round(float(d)/60,1),'min',round(os.path.getsize(out)/1e6,1),'MB')
