// js/builtins.js
window.RAW_BUILTIN_LIB = [
  {
    id:'qinwu', name:'秦梧', gender:'男', identity:'高一学生，捉鬼师', relation:'同班同学', address:'同学',
    personality:'姓名：秦梧，性别：男，论坛昵称：孤勇者秦大侠... (请把你原本的秦梧完整设定粘在这里)',
    description:'浅灰色短发浅灰瞳孔，左耳下有一根长度到肩膀的红绳耳坠。人缘极好，很受欢迎。',
    voiceId: `Aswn_75_0224032102`
  },
  {
    id:'luoyunying', name:'骆云影', gender:'男', identity:'高一转学生，捉鬼师', relation:'转校生/同学', address:'你',
    personality:'姓名：骆云影，性别：男... (请把你原本的骆云影完整设定粘在这里)',
    description:'长的很漂亮，曾被误认为女生过。头发纯黑色，长度到肩膀。空间系血脉，武器是锁魂链。',
    voiceId: ``
  },
  { id:'zhongyueru', name:'钟月茹', gender:'女', identity:'班长', relation:'同学', address:'你', personality:'温柔、内敛，但坚强，对所有人都很好。暗恋秦梧。', description:'班长，暗恋秦梧但不会去打扰。', voiceId:'' },
  { id:'yuanbao', name:'元宝', gender:'女', identity:'高一学生', relation:'同学', address:'你', personality:'活泼可爱。', description:'总是拉着钟月茹和米桔说要去“探险”。', voiceId:'' },
  { id:'miju', name:'米桔', gender:'女', identity:'高一学生', relation:'同学', address:'你', personality:'活泼可爱。', description:'元宝从小到大的好朋友。', voiceId:'' },
  { id:'linyan', name:'林言', gender:'男', identity:'高一学生', relation:'同学', address:'你', personality:'毫无存在感。', description:'在班里没什么存在感。', voiceId:'' },
  { id:'tangjiawei', name:'汤嘉维', gender:'男', identity:'高一学生', relation:'兄弟', address:'你', personality:'大喇叭性格，大大咧咧，没心眼的乐天派。', description:'和秦梧关系很好，总说秦梧是自己的好兄弟。', voiceId:'' }
].map(item => {
  for(let k in item) if(typeof item[k] === 'string') item[k] = item[k].replace(/【IG】/g, '');
  return item;
});

// 默认世界书
window.DEFAULT_WORLD_BACKGROUND = `社会：正常的**现代社会**，有一群人被称为**捉鬼师**...
(请把你原本的世界背景粘在这里)
`;