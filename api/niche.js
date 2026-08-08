module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { q, days=30 } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const after = new Date(); after.setDate(after.getDate()-parseInt(days));
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&regionCode=US&relevanceLanguage=en&publishedAfter=${after.toISOString()}&maxResults=25&order=viewCount&videoDuration=medium&key=${key}`;
    const sr = await fetch(url); const sd = await sr.json();
    if (sd.error) return res.status(400).json({ error: sd.error.message });
    const ids = (sd.items||[]).map(i=>i.id.videoId).filter(Boolean).join(',');
    if (!ids) return res.status(200).json({ videos:[], stats:{totalVideos:0,avgViews:0,avgVph:0,compLevel:'LOW',topChannel:'',topViews:0} });
    const sv = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ids}&key=${key}`);
    const svd = await sv.json();
    if (svd.error) return res.status(400).json({ error: svd.error.message });
    const videos = (svd.items||[]).map(v => {
      const dur = v.contentDetails.duration;
      const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)||[];
      const mins = (parseInt(m[1]||0)*60)+parseInt(m[2]||0);
      if (mins < 5) return null;
      const views=parseInt(v.statistics.viewCount||0), likes=parseInt(v.statistics.likeCount||0);
      const daysAgo=Math.floor((new Date()-new Date(v.snippet.publishedAt))/86400000);
      const vph=daysAgo>0?Math.round(views/(daysAgo*24)):views;
      return { id:v.id, title:v.snippet.title, channel:v.snippet.channelTitle, channelId:v.snippet.channelId,
        views, likes, vph, daysAgo, mins, likeRatio:views>0?((likes/views)*100).toFixed(2):0,
        thumbnail:v.snippet.thumbnails?.medium?.url||'', publishedAt:v.snippet.publishedAt,
        tags:v.snippet.tags||[], url:`https://www.youtube.com/watch?v=${v.id}` };
    }).filter(Boolean).sort((a,b)=>b.views-a.views);
    const totalViews=videos.reduce((s,v)=>s+v.views,0);
    const avgViews=videos.length?Math.round(totalViews/videos.length):0;
    const avgVph=videos.length?Math.round(videos.reduce((s,v)=>s+v.vph,0)/videos.length):0;
    const compLevel=videos.length<5?'VERY LOW':videos.length<10?'LOW':videos.length<20?'MEDIUM':'HIGH';
    return res.status(200).json({ videos, stats:{totalVideos:videos.length,avgViews,avgVph,compLevel,topChannel:videos[0]?.channel||'',topViews:videos[0]?.views||0} });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}
