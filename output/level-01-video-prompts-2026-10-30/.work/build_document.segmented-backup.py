import json,re,hashlib
from pathlib import Path
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT

OUT=Path(__file__).resolve().parent.parent
cat=json.loads((OUT/'.work/catalogue.json').read_text('utf-8'))
doc=Document()
sec=doc.sections[0]
sec.page_width=Inches(8.5);sec.page_height=Inches(11)
sec.top_margin=Inches(.65);sec.bottom_margin=Inches(.65)
sec.left_margin=Inches(.72);sec.right_margin=Inches(.72)
sec.header_distance=Inches(.24);sec.footer_distance=Inches(.25)
for name in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
 s=doc.styles[name]
 s.font.name='Arial';s.font.size=Pt(11)
 s._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Microsoft YaHei')
 s.font.color.rgb=RGBColor.from_string('000000')
 s.paragraph_format.space_after=Pt(6)
 s.paragraph_format.line_spacing=1.12
normal=doc.styles['Normal']
normal.paragraph_format.widow_control=True
for n,size,before,after in [('Title',24,0,14),('Heading 1',18,0,10),('Heading 2',14,12,8),('Heading 3',11,8,5)]:
 st=doc.styles[n];st.font.size=Pt(size);st.font.bold=True
 st.paragraph_format.space_before=Pt(before);st.paragraph_format.space_after=Pt(after)
 st.paragraph_format.keep_with_next=True
# Raw prompts are ordinary editable text, not a picture or shaded callout.
from docx.enum.style import WD_STYLE_TYPE
s=doc.styles.add_style('Prompt',WD_STYLE_TYPE.PARAGRAPH)
s.base_style=normal;s.font.name='Arial';s.font.size=Pt(11)
s._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Microsoft YaHei')
s.paragraph_format.line_spacing=1.04;s.paragraph_format.space_after=Pt(5)
s.paragraph_format.widow_control=True
s=doc.styles.add_style('Metadata',WD_STYLE_TYPE.PARAGRAPH)
s.base_style=normal;s.font.size=Pt(9.5);s.font.color.rgb=RGBColor.from_string('555555')
s.paragraph_format.space_after=Pt(4)
header=sec.header.paragraphs[0];header.style='Metadata';header.text='第一关视频生成提示词    R28 新开局    2026年10月30日'
footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
footer.style='Metadata';footer.add_run('第 ')
f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');footer._p.append(f)
footer.add_run(' 页')
doc.core_properties.title='第一关全部视频生成提示词'
doc.core_properties.subject='当前新开局固定通讯41段及玩家摄影动态模板'
doc.core_properties.author=''
doc.core_properties.keywords='第一关 R28 艾里亚斯 视频提示词 外部AI'

def p(text,style=None): return doc.add_paragraph(text,style)
def heading(text,level=1,newpage=False):
 x=doc.add_paragraph(text,'Heading '+str(level));x.paragraph_format.page_break_before=newpage;return x
def prompt(text):
 for line in text.split('\n'): p(line,'Prompt')
def table(headers,rows,widths):
 t=doc.add_table(rows=1,cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 for i,w in enumerate(widths):t.columns[i].width=Inches(w)
 for i,x in enumerate(headers):t.rows[0].cells[i].text=x
 repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
 for row in rows:
  cells=t.add_row().cells
  for i,x in enumerate(row):cells[i].text=str(x)
 for ri,row in enumerate(t.rows):
  for i,c in enumerate(row.cells):
   c.width=Inches(widths[i]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   mar=OxmlElement('w:tcMar')
   for key,val in [('top','80'),('bottom','80'),('left','110'),('right','110')]:
    el=OxmlElement('w:'+key);el.set(qn('w:w'),val);el.set(qn('w:type'),'dxa');mar.append(el)
   c._tc.get_or_add_tcPr().append(mar)
   for par in c.paragraphs:
    par.paragraph_format.space_after=Pt(0);par.paragraph_format.line_spacing=1.08
    for r in par.runs:r.font.size=Pt(10);r.bold=ri==0
   if ri==0:
    shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E9EEF2');c._tc.get_or_add_tcPr().append(shade)
  cant=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(cant)
 return t

p('第一关全部视频生成提示词','Title')
p('用于外部 AI 制作的完整分段文本与参考图说明','Subtitle')
p('本文件按2026年10月30日当前工作区的新开局代码整理。固定通讯采用10月28日确认的R28版本：8个主线节点、4个补充节点、3个条件变体，共15个条目，按现有播放器切成41段，每段请求10秒。每段都给出可独立复制的完整提示词。')
p('另附玩家摄影的动态模板。它们不是额外添加的固定剧情视频，也不能替代游戏中的真实取景、实体操作和证据核验。旧存档的L1 E系列及第二章任务不混入本包。')
heading('如何直接使用',2)
for x in [
 '1 先在外部工具上传同目录的“艾里亚斯角色参考图.png”，选择角色参考或参考图模式，不把角色设定图强制设成首帧或尾帧。',
 '2 按总表选条目，找到对应分段页，复制“完整提示词”下面的全部英文和中文对白。编号、触发说明、文件名不属于提示词。配套TXT中的BEGIN PROMPT与END PROMPT之间是完全相同的文本。',
 '3 固定通讯每段设10秒；16比9是外部制作建议，不是代码硬性参数。不要把数十秒全文挤进一段10秒视频。',
 '4 同一条目的片段按P01、P02等顺序拼接，保持同一音色、装备、背景、机位和伤情。条件版本只选与实际状态相符的一版。',
 '5 检查坐标和中文对白没有被漏念、改写或画成文字。若所用工具不生成声音，把该段SPEECH中的原文用于单独配音。',
]:p(x)
p('现有参考图是角色设定图而非真实房间布景。不得把白背景、文字标签、多视图或未戴头盔的设定图视图抄进影片；本包不伪造一张已经存在的调度室参考图。')
heading('交付边界',2)
p('本次仅整理提示词与参考素材，未提交外部生成、未花费视频额度、未修改游戏代码。41段含互斥版本，不代表一次通关必须播放410秒；请求时长也不等于已生成媒体的实际时长。外部影片接回游戏、角色和场景连续性、语音质量仍需另行验收。')

heading('固定通讯总表',newpage=True)
rows=[]
for t in cat['tasks']:rows.append([t['id'].replace('L1-R28-',''),t['title'],t['kind'],len(t['parts']),str(len(t['parts'])*10)+'秒'])
table(['编号','视频内容','类别','分段','总请求时长'],rows,[1.23,2.2,1.2,.65,1.72])
p('总计15个条目，41段10秒通讯。V03与V03 QUIET、V04R与V04R STORED、V08与V08 INJURED分别是互斥版本。','Metadata')
heading('人物与空间保持一致',2)
p('人物是一名艾里亚斯：磨损的黄色潜水头盔，不透明深色面罩，黑色干式潜水服，棕褐色背带。头盔保持密闭，不露面孔，不出现身体或袖口异常。不要把宇航员式自拍构图误做成太空服、外太空或失重。')
p('V01至V07R均在干燥的港口总调度室内，身后为关闭的人员门；V08两种版本改为总调度室旁的干燥安全人员通道。地面干燥、有可呼吸空气、正常重力；人物周围不加水下悬浮物或气泡。')
p('通讯采用臂长自拍，画面包含头盔与上身，一只戴手套的前臂出现在下角。允许克制的自然手持轻摆，不切镜、不环绕、不变焦。玩家水下证据片则全程固定机位，两类规则不能混用。')

for ti,t in enumerate(cat['tasks'],1):
 for part in t['parts']:
  heading(f"{t['title']} 第{part['number']}段",newpage=True)
  p(f"{t['id']}    {t['kind']}    {part['number']} / {len(t['parts'])}    请求10秒",'Metadata')
  p('建议保存名  '+part['file'],'Metadata')
  if part['number']==1:p('使用条件  '+t['trigger'])
  else:p('接续同一条通讯上一段；保持相同人物、环境、音色和伤情，不重新自我介绍。')
  heading('完整提示词',2)
  prompt(part['prompt'])
  # Helpful Mandarin line remains byte-for-byte the same as the generated SPEECH.
  p('对白核对  '+part['speech'],'Metadata')

heading('玩家摄影的动态提示词',newpage=True)
p('玩家摄影不是另一组固定人物通讯。最终提示词随实际机位、灯光、遮挡、目标位置与物理状态变化，不能穷举每次玩家截图。下面按当前代码的5类结果文案，各给出目标可见与不可见两种离线样例，共10份；它们不是新增任务编号。')
p('每份都要上传对应玩家实际摄影位置的环境截图，而不是艾里亚斯角色图。环境参考图有意不含3D怪物；只有MONSTER_SUBJECTS明确列出的可见目标才可以生成。新开局的人员侧只通过任务自拍视频呈现，所有玩家摄影样例的HUMAN_SUBJECTS均为空。')
p('目标可见样例以取景有效且进入剧情摄影为前提，时长10秒；不可见样例为普通摄影，时长5秒。普通摄影若最近怪物超出30米，当前策略不提交生成。取景是否有效仍由游戏判断，模板不能反向证明满足距离、照明和无遮挡条件。')
p('选择结果的代码优先级：已入仓且未隔离，其次人员已到达安全处，其次已隔离，其次已受伤退回，最后仅记录当前位置。不能因希望某个结果成立就选用那段提示词。')
p('隔离结果片必须在实际镜头中同时拍到关闭的闸门与仓内目标。不可见版不构成隔离核验证据。已到达安全处或受伤退回的文字只是已发生的后台事实，不允许玩家摄像机穿墙看到艾里亚斯，也不允许切到干燥房间。')
heading('怪物外观',2)
p('只出现一个港口实验生物：浅灰米色连续肉质皮肤、低矮而细长的身体、有关节的爬行肢体、闭合的嘴。不能替换为鲨鱼、普通鱼、可爱动物或另一物种；不把第一关物种猜测写成章鱼或大王乌贼的定论。')
heading('摄影结果清单',2)
table(['前缀','已经成立的结果'],[[x['id'].split('-')[0],x['title']] for x in cat['photos'][::2]],[1.1,5.9])

for item in cat['photos']:
 heading(item['title']+(' 目标可见' if item['visible'] else '目标不可见'),newpage=True)
 p(f"动态模板 {item['id']}    示例请求时长 {item['duration']}秒",'Metadata')
 p(item['condition'])
 p('上传实际机位的环境参考图；不要上传角色设定图。'+('目标必须真的在视野中。' if item['visible'] else '不得生成怪物来填空；此版不是有效隔离证据。'))
 heading('完整提示词',2)
 prompt(item['prompt'])

heading('连续性和交付核对',newpage=True)
for title,text in [
 ('两次撞击','V02A之后的双撞属于游戏中的声音、震动与艇况变化，并非独立的AI视频任务。本包不补造两条撞击电影。修艇、开闸、机械臂取箱同样不能因提示词而自动完成。'),
 ('对白原文','R28对白按代码逐字保留。V05“这样它就找不到你了”不扩写成绝对安全；V06要求上传不代表总部已经收到或回复；V02密码已发给门控，不展示数字密码，不要求玩家输入指定文字。'),
 ('被动与主动声纳','被动声纳常开，只给远处声源大致方位，不提供距离或障碍。主动声纳要先通电，提供地形和距离，同时持续发声并可能吸引生物。声音方位不是入仓证据。'),
 ('伤情','V07R与V08 INJURED按injured为true导出，保留轻微肩伤和受限手臂动作。其他已经受伤后的同ID重用也必须保留真实伤情；不借换一段视频自动痊愈。'),
 ('自拍措辞','代码的通用动作句含helmet camera，但镜头合同优先：这是能看见艾里亚斯头盔与上身的臂长自拍，不是从头盔朝外看的第一人称视角。'),
 ('表演细化的现有缺口','R28多数视频复用同一个简短表演句。本包没有擅自增加怪物露脸、回闪或其他角色；V07R也未把原代码扩写成按肩包扎动作。需要更细表演时，应作为另行批准的导演版，不冒称现有请求。'),
 ('剧情边界','人物一直分路，第二关末才会合。第一关不加入尸体搜取摄像仪、三处生物调查、热粘液菌供水或动态密码任务，不暴露尸体身份、死亡责任、袖口或头盔内秘密。'),
 ('共生背景','本包没有将Panacea解释为攻击病毒，不以共生设定为实验生物攻击添加新结论，也不提前揭露后续调查材料。'),
 ('外部片不是游戏证据','外部生成成功不能自动写入门禁、人物认知、存档或正式媒体证据。素材接入、总时长、连续性和真机效果仍待核验，本次没有修改这些功能。'),
]:
 p(title+'  '+text)

heading('来源与本地检查',newpage=True)
p('本导出读取当前工作区，不以Git已提交版本替代尚未提交的当前实现。任务正文、语音拆分、自拍合同、网络参考图前缀、摄影结果槽位均从现有代码获取，没有调用生成服务。')
for src in cat['sources']:p(str(Path('C:/Users/Lenovo/Desktop/tiefei')/src['path']),'Metadata')
p('本地检索已执行相关query与check；44项规范索引检查通过。仅是本地检索检查，不宣称外部RAG同步、影片已生成或整关已验收。规范未被改写，本次也未更新源代码或索引。')
p('参考图  '+str(OUT/'艾里亚斯角色参考图.png'),'Metadata')
p('可复制文本  '+str(OUT/'第一关视频完整分段提示词.txt'),'Metadata')
path=OUT/'第一关全部视频生成提示词.docx'
doc.save(path)
# XML/text equality checks: every standalone prompt in the companion is also in the Word file.
content='\n'.join(x.text for x in doc.paragraphs)
for t in cat['tasks']:
 assert ''.join(x['speech'] for x in t['parts'])==t['speech'],t['id']
 for x in t['parts']:
  assert x['prompt'] in content,x['file']
  assert x['prompt'].count('SPEECH:')==1,x['file']
  assert 'CAMERA LOCK:' not in x['prompt'],x['file']
for x in cat['photos']:
 assert x['prompt'] in content,x['id']
 assert 'CAMERA LOCK:' in x['prompt'],x['id']
 assert 'HUMAN_SUBJECTS: none visible' in x['prompt'],x['id']
assert content.count('SPEECH:')==41
assert len(cat['tasks'])==15 and len(cat['photos'])==10
print(json.dumps({'docx':str(path),'prompt_blocks':51,'npc_parts':41,'photo_examples':10,'checks':'PASS'},ensure_ascii=False))
