#!/usr/bin/env python3
"""Prepare a local audio/video excerpt and a material JSON without uploading anything."""
import argparse, json, pathlib, re, subprocess, sys
p=argparse.ArgumentParser(description='将本地音频或视频裁成练习片段；不上传')
p.add_argument('--input',required=True);p.add_argument('--id',required=True);p.add_argument('--title',required=True);p.add_argument('--author',default='用户提供')
p.add_argument('--start',type=float,default=0);p.add_argument('--duration',type=float,default=300);p.add_argument('--version',type=int,default=1);p.add_argument('--out',default='media/prepared');p.add_argument('--source');p.add_argument('--srt',help='可选原始时间轴字幕；仍标记为待校对')
a=p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',a.id) or a.start<0 or a.duration<=0 or a.version<1:p.error('ID、时间或版本不合法')
source=pathlib.Path(a.input).expanduser().resolve()
if not source.is_file():p.error('输入文件不存在；请先下载或提供本地文件')
out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
audio=out/f'{a.id}-v{a.version}.mp3';manifest=out/f'{a.id}-v{a.version}.json'
if audio.exists() or manifest.exists():p.error('此版本已存在，请增加版本号或另选输出位置')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-ss',str(a.start),'-i',str(source),'-t',str(a.duration),'-vn','-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','96k',str(audio)],check=True)
segments=[]
def stamp(s):
 h,m,v=s.replace(',','.').split(':');return int(h)*3600+int(m)*60+float(v)
if a.srt:
 for chunk in re.split(r'\n\s*\n',pathlib.Path(a.srt).read_text(encoding='utf-8-sig').replace('\r','').strip()):
  lines=chunk.splitlines();time=next((line for line in lines if '-->' in line),None)
  if not time:continue
  left,right=time.split('-->');start,end=stamp(left.strip()),stamp(right.strip().split()[0])
  if start>=a.start and end<=a.start+a.duration:
   text=' '.join(lines[lines.index(time)+1:]).strip()
   segments.append({'id':f's{len(segments)+1}','text':text,'start':round(start-a.start,3),'end':round(end-a.start,3),'uncertain':True,'note':'机器字幕，尚未回听校对'})
if not segments:segments=[{'id':'audio','text':'','note':'仅音频材料，尚无已校对逐字稿；可直接跟读。','uncertain':True}]
data={'schemaVersion':1,'id':a.id,'version':a.version,'title':a.title,'author':a.author,'source':a.source or source.name,'modules':['gen'],'visibility':'private','audioFile':audio.name,'segments':segments}
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f'材料包：{manifest}\n音频：{audio}\n请先试听、核对，再导入。没有上传。')
