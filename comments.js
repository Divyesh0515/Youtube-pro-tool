module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, key: clientKey } = req.query;
  const key = process.env.YOUTUBE_API_KEY || clientKey;
  if (!key) return res.status(400).json({ error: 'API key missing' });
  if (!id) return res.status(400).json({ error: 'Video ID required' });

  try {
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${id}&order=relevance&maxResults=50&key=${key}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message });
    
    const comments = (d.items || []).map(c => ({
      text: c.snippet.topLevelComment.snippet.textDisplay,
      likes: c.snippet.topLevelComment.snippet.likeCount,
      author: c.snippet.topLevelComment.snippet.authorDisplayName,
      publishedAt: c.snippet.topLevelComment.snippet.publishedAt
    }));
    
    const demandWords = ['more','again','another','please','need','want','love','amazing','best','incredible','awesome','perfect'];
    const negWords = ['bad','worst','hate','boring','skip','waste','terrible','awful','dislike'];
    const shockWords = ['wow','omg','crazy','insane','unbelievable','shocking','mind','blown','cant believe','cannot believe'];
    
    let demandScore=0, negScore=0, shockScore=0;
    const wordFreq = {};
    
    comments.forEach(c => {
      const text = c.text.toLowerCase();
      demandWords.forEach(w => { if(text.includes(w)) demandScore++; });
      negWords.forEach(w => { if(text.includes(w)) negScore++; });
      shockWords.forEach(w => { if(text.includes(w)) shockScore++; });
      text.split(/\s+/).forEach(w => {
        w = w.replace(/[^a-z]/g,'');
        if(w.length > 4) wordFreq[w] = (wordFreq[w]||0)+1;
      });
    });
    
    const topWords = Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([word,count])=>({word,count}));
    const total = comments.length || 1;
    const moreCount = comments.filter(c=>c.text.toLowerCase().includes('more')||c.text.toLowerCase().includes('again')).length;
    
    return res.status(200).json({
      comments: comments.slice(0,20),
      analysis: {
        total: comments.length,
        sentiment: {
          demand: Math.round((demandScore/total)*100),
          negative: Math.round((negScore/total)*100),
          shock: Math.round((shockScore/total)*100),
          positive: Math.round(((total-negScore)/total)*100)
        },
        topWords, moreCount,
        demandLevel: moreCount > 10 ? 'HIGH' : moreCount > 5 ? 'MEDIUM' : 'LOW',
        viralSignal: shockScore > total*0.3 ? 'STRONG' : shockScore > total*0.1 ? 'MODERATE' : 'WEAK'
      }
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
