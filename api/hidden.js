module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lang='de', maxSubs=20000, minViews=50000 } = req.query;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(400).json({ error: 'API key not configured' });

  const langMap = {
    en:{code:'en',region:'US',name:'English 🇺🇸'},
    de:{code:'de',region:'DE',name:'German 🇩🇪'},
    fr:{code:'fr',region:'FR',name:'French 🇫🇷'},
    ru:{code:'ru',region:'RU',name:'Russian 🇷🇺'},
    es:{code:'es',region:'ES',name:'Spanish 🇪🇸'},
    it:{code:'it',region:'IT',name:'Italian 🇮🇹'},
    pt:{code:'pt',region:'BR',name:'Portuguese 🇧🇷'},
    nl:{code:'nl',region:'NL',name:'Dutch 🇳🇱'},
    sv:{code:'sv',region:'SE',name:'Swedish 🇸🇪'},
    pl:{code:'pl',region:'PL',name:'Polish 🇵🇱'}
  };

  const langInfo = langMap[lang] || langMap['de'];

  try {
    // Step 1: Search trending videos in that language
    const after = new Date(); after.setDate(after.getDate()-30);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&regionCode=${langInfo.region}&relevanceLanguage=${langInfo.code}&publishedAfter=${after.toISOString()}&maxResults=50&order=viewCount&videoDuration=medium&key=${key}`;
    const sr = await fetch(searchUrl);
    const sd = await sr.json();
    if (sd.error) return res.status(400).json({ error: sd.error.message });

    // Step 2: Get unique channel IDs
    const channelIds = [...new Set((sd.items||[]).map(i=>i.snippet.channelId).filter(Boolean))];
    if (!channelIds.length) return res.status(200).json({ gems: [] });

    // Step 3: Check channel subscriber counts
    const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds.join(',')}&key=${key}`;
    const cr = await fetch(chUrl);
    const cd = await cr.json();
    if (cd.error) return res.status(400).json({ error: cd.error.message });

    // Filter small channels only
    const smallChannels = (cd.items||[]).filter(ch => {
      const subs = parseInt(ch.statistics.subscriberCount||0);
      return subs > 100 && subs <= parseInt(maxSubs);
    });

    if (!smallChannels.length) return res.status(200).json({ gems: [], message: 'No small channels found, try different language' });

    // Step 4: For each small channel, get last 6 videos
    const gems = [];
    for (const ch of smallChannels.slice(0,10)) {
      try {
        const vUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ch.id}&type=video&order=date&maxResults=6&videoDuration=medium&key=${key}`;
        const vr = await fetch(vUrl);
        const vd = await vr.json();
        const vids = (vd.items||[]).map(i=>i.id.videoId).filter(Boolean);
        if (!vids.length) continue;

        const vsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${vids.join(',')}&key=${key}`;
        const vsr = await fetch(vsUrl);
        const vsd = await vsr.json();

        const videos = (vsd.items||[]).map(v=>{
          const dur=v.contentDetails.duration;
          const m=dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)||[];
          const mins=(parseInt(m[1]||0)*60)+parseInt(m[2]||0);
          if(mins<5)return null;
          const views=parseInt(v.statistics.viewCount||0);
          const likes=parseInt(v.statistics.likeCount||0);
          const daysAgo=Math.floor((new Date()-new Date(v.snippet.publishedAt))/86400000);
          return { id:v.id, title:v.snippet.title, views, likes, mins, daysAgo,
            likeRatio:views>0?((likes/views)*100).toFixed(1):0,
            thumbnail:v.snippet.thumbnails?.medium?.url||'',
            tags:v.snippet.tags||[],
            publishedAt:v.snippet.publishedAt,
            url:`https://www.youtube.com/watch?v=${v.id}` };
        }).filter(Boolean);

        if (!videos.length) continue;

        const avgViews = Math.round(videos.reduce((s,v)=>s+v.views,0)/videos.length);
        if (avgViews < parseInt(minViews)) continue;

        // Growth velocity
        const sorted = [...videos].sort((a,b)=>a.daysAgo-b.daysAgo);
        const recent3 = sorted.slice(0,3);
        const older3 = sorted.slice(3);
        const recentAvg = recent3.length ? Math.round(recent3.reduce((s,v)=>s+v.views,0)/recent3.length) : 0;
        const olderAvg = older3.length ? Math.round(older3.reduce((s,v)=>s+v.views,0)/older3.length) : 0;
        const growthVelocity = olderAvg > 0 ? Math.round(((recentAvg-olderAvg)/olderAvg)*100) : 0;

        // All tags from videos
        const allTags = [...new Set(videos.flatMap(v=>v.tags))].slice(0,20);

        // Niche from tags + titles
        const commonWords = {};
        videos.forEach(v=>{
          v.title.toLowerCase().split(/\s+/).forEach(w=>{
            if(w.length>4)commonWords[w]=(commonWords[w]||0)+1;
          });
        });
        const nicheWords = Object.entries(commonWords).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w])=>w);

        const subs = parseInt(ch.statistics.subscriberCount||0);

        gems.push({
          channel:{
            id:ch.id, name:ch.snippet.title,
            subs, country:ch.snippet.country||langInfo.region,
            thumbnail:ch.snippet.thumbnails?.default?.url||'',
            language:langInfo.name,
            url:`https://www.youtube.com/channel/${ch.id}`
          },
          videos: videos.slice(0,6),
          stats:{
            avgViews, growthVelocity,
            trend: growthVelocity>20?'🚀 GROWING FAST':growthVelocity>0?'📈 GROWING':'📊 STABLE',
            allTags, nicheHint:nicheWords.join(', ')
          }
        });
      } catch(e) { continue; }
    }

    // Sort by avg views
    gems.sort((a,b)=>b.stats.avgViews-a.stats.avgViews);
    return res.status(200).json({ gems, language:langInfo.name, total:gems.length });

  } catch(e) { return res.status(500).json({ error: e.message }); }
}
