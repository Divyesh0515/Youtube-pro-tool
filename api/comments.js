module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { id } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });
  if (!id) return res.status(400).json({ error: 'Video ID required' });
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${id}&order=relevance&maxResults=50&key=${key}`);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    const comments = (d.items||[]).map(c=>({
      text:c.snippet.topLevelComment.snippet.textDisplay,
      likes:c.snippet.topLevelComment.snippet.likeCount,
      author:c.snippet.topLevelComment.snippet.authorDisplayName,
      publishedAt:c.snippet.topLevelComment.snippet.publishedAt
    }));
    const demandW=['more','again','another','please','need','want','love','amazing','best','incredible','awesome','perfect','great'];
    const negW=['bad','worst','hate','boring','skip','waste','terrible','awful'];
    const shockW=['wow','omg','crazy','insane','unbelievable','shocking','mind','blown','cant believe'];
    // Language detection
    const langPatterns = {
      german:/\b(und|ich|das|ist|ein|die|der|nicht|sie|mit|auf|von|wird)\b/i,
      french:/\b(et|le|la|les|un|une|des|est|pas|que|vous|nous|pour)\b/i,
      russian:/[а-яёА-ЯЁ]/,
      spanish:/\b(que|es|en|el|la|los|las|un|una|por|con|del|muy)\b/i,
    };
    let langCounts={english:0,german:0,french:0,russian:0,spanish:0,other:0};
    let demandScore=0,negScore=0,shockScore=0;
    const wordFreq={};
    comments.forEach(c=>{
      const text=c.text.toLowerCase();
      demandW.forEach(w=>{if(text.includes(w))demandScore++;});
      negW.forEach(w=>{if(text.includes(w))negScore++;});
      shockW.forEach(w=>{if(text.includes(w))shockScore++;});
      text.split(/\s+/).forEach(w=>{w=w.replace(/[^a-z]/g,'');if(w.length>4)wordFreq[w]=(wordFreq[w]||0)+1;});
      let detected=false;
      for(const [lang,pattern] of Object.entries(langPatterns)){
        if(pattern.test(c.text)){langCounts[lang]++;detected=true;break;}
      }
      if(!detected)langCounts.english++;
    });
    const total=comments.length||1;
    const topWords=Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([word,count])=>({word,count}));
    const moreCount=comments.filter(c=>c.text.toLowerCase().includes('more')||c.text.toLowerCase().includes('again')).length;
    const englishPct=Math.round((langCounts.english/total)*100);
    return res.status(200).json({
      comments:comments.slice(0,20),
      analysis:{
        total:comments.length,
        sentiment:{
          demand:Math.round((demandScore/total)*100),
          negative:Math.round((negScore/total)*100),
          shock:Math.round((shockScore/total)*100),
          positive:Math.round(((total-negScore)/total)*100)
        },
        topWords, moreCount,
        demandLevel:moreCount>10?'HIGH':moreCount>5?'MEDIUM':'LOW',
        viralSignal:shockScore>total*0.3?'STRONG':shockScore>total*0.1?'MODERATE':'WEAK',
        languages:langCounts,
        englishPct,
        internationalAudience:englishPct<70,
        insight: englishPct<50 ? `🔥 Only ${englishPct}% English comments — HUGE opportunity to make English version!` :
                 englishPct<70 ? `✅ ${englishPct}% English comments — Some international audience already` :
                 `📊 ${englishPct}% English comments — Primarily English audience`
      }
    });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
