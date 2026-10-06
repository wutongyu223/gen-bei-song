#!/usr/bin/env python3
"""Convert the user's already extracted family letters into local, private material packages."""
import argparse,json,pathlib,re
p=argparse.ArgumentParser(description='从已整理的家书 Markdown 生成本地材料包，不上传')
p.add_argument('--input',required=True);p.add_argument('--out',default='media/family-letters');a=p.parse_args()
source=pathlib.Path(a.input).expanduser();content=source.read_text(encoding='utf8');out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
blocks=re.split(r'^###\s+',content,flags=re.M)[1:]
count=0
for block in blocks:
 title,_,body=block.partition('\n')
 boundary_note=''
 # Known structural defects in the supplied edition. Preserve wording; disclose boundary repairs.
 if title.strip()=='致九弟李弟·须戒傲惰二字':
  body=body.replace('【泽文】','【译文】');boundary_note='源文件将译文标记写为【泽文】，本包据正文结构识别为译文。'
 elif title.strip()=='禀父母·送参冀减息银':
  body=re.sub(r'^译文】','【译文】',body,flags=re.M);boundary_note='源文件译文标记缺左括号，本包补识别边界。'
 elif title.strip()=='禀父母·取借款须专人去':
  body=re.sub(r'^译文儿子','【译文】儿子',body,flags=re.M);boundary_note='源文件译文标记无括号，本包按“译文”起点识别边界。'
 elif title.strip() in ['禀父母·请勿悬望得差','禀父母·请敬接诰封轴']:
  body=body.replace('**【注释】**','**【译文】**',1)
  body=re.sub(r'(?m)^(?=- ①)','**【注释】**\n\n',body,count=1)
  boundary_note='源文件将现代译文误标为注释；本包据正文结构分离注释与译文，文字未改。'
 elif title.strip()=='致诸弟·述升内阁学士':
  body=body.replace('澄侯、子植、季洪三位老弟足下：','【译文】\n\n澄侯、子植、季洪三位老弟足下：',1)
  boundary_note='源文件缺译文标题，本包据现代译文开头识别边界。'
 original=re.search(r'(?:\*\*)?【原文】(?:\*\*)?\s*([\s\S]*?)(?=(?:\*\*)?【(?:注释|译文)】(?:\*\*)?|\Z)',body)
 if not original:continue
 translation=re.search(r'(?:\*\*)?【译文】(?:\*\*)?\s*([\s\S]*?)(?=^##\s|\Z)',body,re.M)
 notes=re.search(r'(?:\*\*)?【注释】(?:\*\*)?\s*([\s\S]*?)(?=(?:\*\*)?【译文】(?:\*\*)?|\Z)',body)
 paragraphs=[s.strip() for s in re.split(r'\n\s*\n',original.group(1)) if s.strip() and not s.startswith('#')]
 if not paragraphs:continue
 count+=1;segments=[]
 for para in paragraphs:
  # Split only at visible punctuation; no editorial rewrite or silent character correction.
  pieces=re.findall(r'[^。！？]+[。！？]?|[。！？]',para)
  for piece in pieces:
   if piece.strip():segments.append({'id':f'p{len(segments)+1}','text':piece.strip(),'uncertain':True})
 if translation:segments[0]['translation']='本信完整译文（与句子未逐一对齐）：\n'+translation.group(1).strip()
 segments[0]['note']='用户所提供网络版：段落与错字尚未逐一核对；保留原文。'+boundary_note+('\n'+notes.group(1).strip() if notes else '')
 data={'schemaVersion':1,'id':f'zeng-letter-{count:03d}','version':1,'title':title.strip(),'author':'曾国藩 · 家书','source':source.name+'；用户提供网络版，原文、译文及注释尚待校核','modules':['bei','song'],'visibility':'private','segments':segments}
 (out/f'{count:03d}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f'已生成 {count} 份材料包：{out}。仅本地文件，没有上传；导入前请核对。')
