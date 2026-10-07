/* Draws the "verse of the day" picture: a scenery photo, a frosted-glass panel with the verse, and an optional pastor / church footer.
   Shared by the app (canvas) and the service worker (OffscreenCanvas, for the notification image).

   verseBg(n)     -> Promise<Image|ImageBitmap|null>  loads background photo number n (falls back to the next one, then to null)
   verseFonts(f)  -> Promise                           makes sure the Unicode Telugu font is ready before drawing
   verseCanvas(canvas,text,ref,o) -> canvas
     o: {w,h, bg:(Image|ImageBitmap), theme:0-4 (painted scenery used only when no photo loads), accent,
         title, font, pastor:{name,phone,church}, photo:(Image|ImageBitmap),
         pal:[sky colours] (painted scenery), greet:'text shown above the title', date:'text shown under the reference' }
   verseTheme(book,chapter,verse) -> {key,en,te,shape,pal}   the theme of a verse (love, peace, strength …)
   verseBgFor(themeKey,n,bgs,opt) -> Promise               background photo that suits the theme (see below) */
(function(g){
  const IS_WIN=typeof document!=='undefined';

  /* ---- Background photos (free to use: Unsplash License / Pexels License). Add or remove lines freely – one per day, in rotation.
     Pick calm, bright-to-medium scenes with space in the middle (the verse sits on a frosted panel, so busy photos still read well). ---- */
  g.VERSE_BGS=g.VERSE_BGS||[
    'https://images.unsplash.com/photo-1689788647851-3203de944519?auto=format&fit=crop&w=2000&q=75',  // sunrise over a mountain lake
    'https://images.unsplash.com/photo-1647974794666-20c41a4a3a4a?auto=format&fit=crop&w=2000&q=75',  // glowing dawn over a snowy lake
    'https://images.pexels.com/photos/33786721/pexels-photo-33786721.jpeg?auto=compress&cs=tinysrgb&w=1800', // golden wheat field at sunset
    'https://images.pexels.com/photos/33411342/pexels-photo-33411342.jpeg?auto=compress&cs=tinysrgb&w=1800', // wheat in soft evening light
    'https://images.pexels.com/photos/37161481/pexels-photo-37161481.jpeg?auto=compress&cs=tinysrgb&w=1800'  // wheat in sunset light
  ];

  /* ---- Verse themes: every verse of the day belongs to a theme; the picture follows it (photo tagged with that theme, else a painted scene in the theme's colours) ---- */
  const TH={
    love:     {en:'Love',      te:'\u0C2A\u0C4D\u0C30\u0C47\u0C2E',                 shape:0,pal:['#4a1f4e','#d9587a','#ffc1a6']},
    peace:    {en:'Peace',     te:'\u0C38\u0C2E\u0C3E\u0C27\u0C3E\u0C28\u0C02',     shape:2,pal:['#2b5d9b','#6aa6dd','#cfe8f7']},
    strength: {en:'Strength',  te:'\u0C2C\u0C32\u0C02',                               shape:2,pal:['#14213d','#3d5a80','#e0a96d']},
    faith:    {en:'Faith',     te:'\u0C35\u0C3F\u0C36\u0C4D\u0C35\u0C3E\u0C38\u0C02', shape:4,pal:['#2f2358','#a2506a','#f0985a']},
    praise:   {en:'Praise',    te:'\u0C38\u0C4D\u0C24\u0C41\u0C24\u0C3F',            shape:0,pal:['#4d2400','#b86d00','#e9b542']},
    guidance: {en:'Guidance',  te:'\u0C28\u0C21\u0C3F\u0C2A\u0C3F\u0C02\u0C2A\u0C41', shape:0,pal:['#0f3d3e','#3f8f7a','#f2e3a1']},
    hope:     {en:'Hope',      te:'\u0C28\u0C3F\u0C30\u0C40\u0C15\u0C4D\u0C37\u0C23', shape:0,pal:['#1b2a5e','#c2597a','#f6b26b']},
    creation: {en:'Creation',  te:'\u0C38\u0C43\u0C37\u0C4D\u0C1F\u0C3F',            shape:1,pal:['#040a1c','#10224f','#27407a']},
    salvation:{en:'Salvation', te:'\u0C30\u0C15\u0C4D\u0C37\u0C23',                   shape:4,pal:['#1a1033','#7b2d52','#ffb36b']},
    prayer:   {en:'Prayer',    te:'\u0C2A\u0C4D\u0C30\u0C3E\u0C30\u0C4D\u0C25\u0C28', shape:1,pal:['#0a1a2f','#1d3b63','#6c8fbf']},
    wisdom:   {en:'Wisdom',    te:'\u0C1C\u0C4D\u0C1E\u0C3E\u0C28\u0C02',            shape:3,pal:['#2c2010','#9a6f22','#e2bd72']},
    provision:{en:'Care & provision',te:'\u0C15\u0C3E\u0C2A\u0C41\u0C26\u0C32',      shape:3,pal:['#3f2a0c','#a8761f','#e0b45a']}
  };
  g.VERSE_THEMES=TH;
  /* today's date as text for the picture: 'en' = Wednesday, 7 October 2026 ; 'te' = the same in Telugu */
  g.verseDate=function(lang){try{return new Date().toLocaleDateString(lang==='te'?'te-IN':'en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}catch(e){return ''}};
  /* book:chapter:verse -> theme. Verses that are not listed use their book (Psalms = praise, Gospels = faith, …) */
  const VT={};
  ('love:36.3.17 43.3.16 45.5.8 46.13.13 62.4.19|peace:19.55.22 23.26.3 23.43.2 40.11.28 43.14.27 43.16.33 50.4.7 60.5.7|'+
   'strength:2.14.14 5.31.6 6.1.9 16.8.10 19.27.1 19.46.1 19.121.2 20.18.10 23.40.31 23.41.10 34.1.7 44.1.8 46.10.13 47.12.9 49.6.10 50.4.13 55.1.7|'+
   'faith:6.24.15 19.37.4 40.5.16 42.1.37 43.15.5 46.15.58 47.5.7 51.3.23 58.11.1 58.13.8 59.4.7|'+
   'praise:13.16.34 19.100.4 19.103.1 19.118.24 19.136.1 35.3.18 52.5.16|'+
   'guidance:1.28.15 19.119.105 20.3.5 20.3.6 43.8.12|'+
   'hope:19.30.5 24.29.11 25.3.22 40.28.20 45.8.28 45.15.13 66.21.4|'+
   'creation:1.1.1 19.139.14|'+
   'salvation:18.19.25 23.53.5 43.10.10 43.14.6 47.5.17 48.2.20 49.2.8 62.1.9 66.3.20|'+
   'prayer:14.7.14 24.33.3 40.7.7 41.11.24 50.4.6|'+
   'wisdom:19.119.11 20.22.6 21.3.1 33.6.8 45.12.2 59.1.5|'+
   'provision:4.6.24 19.23.1 19.91.1 19.91.11 40.6.33 50.4.19').split('|').forEach(r=>{const a=r.split(':');a[1].split(' ').forEach(k=>{VT[k]=a[0]})});
  const BOOKT={19:'praise',20:'wisdom',21:'wisdom',23:'hope',40:'faith',41:'faith',42:'faith',43:'faith',44:'strength',45:'faith',59:'wisdom'};
  const KEYS=Object.keys(TH);
  g.verseTheme=function(b,c,v){
    const k=VT[b+'.'+c+'.'+v]||BOOKT[b]||KEYS[(((+b||0)*7+(+c||0)*3+(+v||0))%KEYS.length+KEYS.length)%KEYS.length];
    return Object.assign({key:k},TH[k]);
  };
  /* Built-in photos (indexes into VERSE_BGS) used only for themes they really suit, and only if no own photo fits. Other themes get the painted scene. */
  g.THEME_BGS=g.THEME_BGS||{peace:[1],creation:[0,1],hope:[0],praise:[0],guidance:[0],provision:[2,3,4]};

  const normU=u=>/^https?:/i.test(u)?u:'/'+String(u).replace(/^\/+/,'');
  async function loadFrom(L,n,opt){
    const N=L.length,tries=(opt&&opt.tries)||3,ms=(opt&&opt.ms)||8000;if(!N)return null;
    for(let k=0;k<Math.min(N,tries);k++){
      const u=L[(((n|0)+k)%N+N)%N];
      try{
        if(IS_WIN){
          return await new Promise((ok,no)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=no;i.src=u;setTimeout(no,ms)});
        }
        const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
        const r=await fetch(u,{mode:'cors',signal:ctl.signal});clearTimeout(t);
        if(!r.ok)throw 0;
        return await createImageBitmap(await r.blob());
      }catch(e){}
    }
    return null;        // no photo reachable: the painted scenery below is used instead
  }
  g.verseBg=function(n,opt){return loadFrom(g.VERSE_BGS||[],n,opt)};      // (older call, no theme)
  /* bgs = the photos added in Daily Verse Image: [{image,theme}] (theme '' = any verse). Order of choice:
     photo tagged with this verse's theme -> photo for any verse -> built-in photo that suits the theme -> null (painted scene in the theme's colours) */
  g.verseBgFor=function(theme,n,bgs,opt){
    const own=(bgs||[]).map(x=>typeof x==='string'?{image:x,theme:''}:x).filter(x=>x&&x.image);
    let L=own.filter(x=>x.theme===theme);
    if(!L.length)L=own.filter(x=>!x.theme||x.theme==='any');
    let urls=L.map(x=>normU(x.image));
    if(!urls.length&&!own.length)urls=((g.THEME_BGS||{})[theme]||[]).map(i=>g.VERSE_BGS[i]).filter(Boolean);
    return loadFrom(urls,n,opt);
  };

  /* Noto Serif Telugu = complete Unicode Telugu (conjuncts, vowel signs) – used for the verse. */
  g.verseFonts=async function(fam){
    const race=(p)=>Promise.race([p,new Promise(r=>setTimeout(r,5000))]);
    try{
      if(IS_WIN&&document.fonts){
        const f=fam||'"Noto Serif Telugu"';
        await race(Promise.all([document.fonts.load('500 40px '+f,'\u0C08A1'),document.fonts.load('700 40px '+f,'\u0C08A1'),document.fonts.load('400 40px "Ramabhadra"','\u0C08A1'),document.fonts.load('400 40px "Ponnala"','\u0C08A1')]));
        return;
      }
      if(g.fonts&&g.FontFace){      // service worker: read Google's CSS, load the Telugu + Latin files ourselves
        const css=await race(fetch('https://fonts.googleapis.com/css2?family=Ramabhadra&family=Ponnala&family=Noto+Serif+Telugu:wght@500;700'+((g.VERSE_EXTRA_FONTS||[]).filter(n=>/^[\w ]{2,60}$/.test(n)).map(n=>'&family='+n.replace(/ /g,'+')).join(''))+'&display=swap').then(r=>r.text()));
        if(!css)return;
        const jobs=[];
        css.split('@font-face').slice(1).forEach(b=>{
          const u=(b.match(/url\(([^)]+)\)/)||[])[1],fn=((b.match(/font-family:\s*['"]?([^;'"]+)/)||[])[1]||'Noto Serif Telugu').trim(),wt=(b.match(/font-weight:\s*(\d+)/)||[])[1],ur=(b.match(/unicode-range:\s*([^;]+)/)||[])[1];
          if(!u)return;
          const f=new FontFace(fn,'url('+u+')',{weight:wt||'500',unicodeRange:ur||'U+0-10FFFF'});
          jobs.push(f.load().then(x=>g.fonts.add(x)).catch(()=>{}));
        });
        await race(Promise.all(jobs));
      }
    }catch(e){}
  };

  /* ---- painted scenery (only used when no photo could be loaded) ---- */
  const SCENES=[['#1b2a5e','#c2597a','#f6b26b'],['#040a1c','#10224f','#27407a'],['#2b5d9b','#6aa6dd','#cfe8f7'],['#e9a93a','#f4cf7c','#fbeab8'],['#2f2358','#a2506a','#f0985a']];
  function hills(x,w,h,y,amp,col,ph){x.fillStyle=col;x.beginPath();x.moveTo(0,h);x.lineTo(0,y);
    for(let i=0;i<=w;i+=20)x.lineTo(i,y-amp*(Math.sin(i/w*5+ph)*.5+Math.sin(i/w*11+ph*2)*.25+.5));x.lineTo(w,h);x.closePath();x.fill()}
  function scene(x,w,h,t,pal){
    const c=(pal&&pal.length>1)?pal:SCENES[t%5],sk=x.createLinearGradient(0,0,0,h*.8);c.forEach((k,i)=>sk.addColorStop(i/(c.length-1),k));x.fillStyle=sk;x.fillRect(0,0,w,h);
    if(t===1){x.fillStyle='#fff';for(let i=0;i<90;i++){const a=(i*7919)%1000/1000,b=(i*104729)%1000/1000;x.globalAlpha=.35+.5*((i*31)%10)/10;x.fillRect(a*w,b*h*.6,2.2,2.2)}x.globalAlpha=1;
      x.fillStyle='#f7efc9';x.beginPath();x.arc(w*.82,h*.2,h*.07,0,7);x.fill();x.fillStyle='#10224f';x.beginPath();x.arc(w*.82+h*.025,h*.2-h*.01,h*.06,0,7);x.fill()}
    if(t===0||t===4||t===3){x.fillStyle='rgba(255,236,170,.9)';x.beginPath();x.arc(w*.5,h*.62,h*.09,0,7);x.fill();
      x.globalAlpha=.18;x.fillStyle='#fff7d0';for(let i=0;i<14;i++){const a=Math.PI+i/13*Math.PI;x.beginPath();x.moveTo(w*.5,h*.62);x.lineTo(w*.5+Math.cos(a-.04)*w,h*.62+Math.sin(a-.04)*w);x.lineTo(w*.5+Math.cos(a+.04)*w,h*.62+Math.sin(a+.04)*w);x.fill()}x.globalAlpha=1}
    if(t===2){x.fillStyle='#e8f1fa';[[.2,.45,.22],[.55,.38,.3],[.85,.5,.2]].forEach(m=>{x.beginPath();x.moveTo(w*(m[0]-m[2]),h*.72);x.lineTo(w*m[0],h*m[1]);x.lineTo(w*(m[0]+m[2]),h*.72);x.fill()});
      x.fillStyle='#35607f';[[.1,.55,.3],[.6,.5,.35],[.95,.58,.25]].forEach(m=>{x.beginPath();x.moveTo(w*(m[0]-m[2]),h*.75);x.lineTo(w*m[0],h*m[1]);x.lineTo(w*(m[0]+m[2]),h*.75);x.fill()});
      const lk=x.createLinearGradient(0,h*.72,0,h);lk.addColorStop(0,'#3d7fb5');lk.addColorStop(1,'#16436b');x.fillStyle=lk;x.fillRect(0,h*.72,w,h*.28);return}
    hills(x,w,h,h*.74,h*.1,t===3?'#b8862a':'#2a2147',1);hills(x,w,h,h*.84,h*.09,t===3?'#7b6a22':'#17122e',3);
    if(t===4){x.fillStyle='#0b0820';const cx=w*.76,cy=h*.6;x.fillRect(cx-5,cy-h*.1,10,h*.2);x.fillRect(cx-h*.045,cy-h*.065,h*.09,9)}
  }

  /* ---- helpers ---- */
  function cover(x,img,w,h,zoom){            // draw a photo like CSS object-fit:cover
    const iw=img.width,ih=img.height,s=Math.max(w/iw,h/ih)*(zoom||1);
    x.drawImage(img,(w-iw*s)/2,(h-ih*s)/2,iw*s,ih*s);
  }
  function rr(x,X,Y,W,H,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+W,Y,X+W,Y+H,r);x.arcTo(X+W,Y+H,X,Y+H,r);x.arcTo(X,Y+H,X,Y,r);x.arcTo(X,Y,X+W,Y,r);x.closePath()}
  function light(hex,k){                      // mix a #rrggbb colour with white, so the accent stays readable on a photo
    const m=/^#?([\da-f]{6})$/i.exec(hex||'');if(!m)return '#F1D48B';
    const n=parseInt(m[1],16),c=[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(255-v)*k));return 'rgb('+c.join(',')+')';
  }

  /* ---- picks the "main text" of a verse to highlight: an explicit phrase (o.hl) if given, otherwise the strongest short clause ---- */
  g.verseKey=function(words,phrase){
    const set=new Set(),n=words.length,clean=t=>String(t).replace(/[\s,;:.!?"'\u201c\u201d\u2018\u2019()\[\]\u2014\-\u0964]+/g,'');
    if(phrase){
      const pw=String(phrase).trim().split(/\s+/).map(clean).filter(Boolean);
      for(let i=0;pw.length&&i+pw.length<=n;i++)if(pw.every((q,k)=>clean(words[i+k])===q)){pw.forEach((_,k)=>set.add(i+k));return set}
    }
    if(n<5)return set;
    const cl=[];let st=0;
    words.forEach((wd,i)=>{if(/[,;:.!?\u0964]["'\u201d\u2019)]*$/.test(wd)||i===n-1){cl.push([st,i]);st=i+1}});
    let best=null,bs=-9;
    cl.forEach((c,idx)=>{const len=c[1]-c[0]+1;if(len<2)return;const sc=Math.min(len,5)-(len>6?(len-6)*.4:0)-idx*.15;if(sc>bs){bs=sc;best=c}});
    if(!best)best=[Math.floor((n-4)/2),Math.floor((n-4)/2)+3];
    let a=best[0],b=best[1];
    const FILL=['\u0C2E\u0C30\u0C32\u0C3E','\u0C2E\u0C30\u0C32','\u0C05\u0C2A\u0C4D\u0C2A\u0C41\u0C21\u0C41','\u0C15\u0C3E\u0C17\u0C3E','\u0C05\u0C2F\u0C3F\u0C24\u0C47','\u0C05\u0C02\u0C26\u0C41\u0C15\u0C41','\u0C05\u0C17\u0C41\u0C1F\u0C1A\u0C47\u0C24'];
    while(b-a>=2&&FILL.indexOf(clean(words[a]))>=0)a++;      // skip opening connectors (మరల, అప్పుడు, కాగా …)
    if(b-a+1>6){if(cl.length===1){a=Math.floor((n-5)/2);b=a+4}else b=a+5}
    for(let i=a;i<=b;i++)set.add(i);
    return set;
  };

  g.verseCanvas=function(c,text,ref,o){
    o=o||{};
    const w=o.w||1200,h=o.h||630,u=Math.min(w,h),gold=light(o.accent||'#B8892B',.5),
          P=o.pastor&&(o.pastor.name||o.pastor.church||o.pastor.phone)?o.pastor:null,
          fam=o.font||'"Ramabhadra","Noto Serif Telugu","Noto Sans Telugu",Georgia,serif';
    c.width=w;c.height=h;
    const x=c.getContext('2d'),blurOK=typeof x.filter==='string';
    const paint=()=>{if(o.bg)cover(x,o.bg,w,h,1.02);else scene(x,w,h,o.theme||0,o.pal)};

    /* 1 · photo + gentle darkening so white text always reads */
    paint();
    const sc=x.createLinearGradient(0,0,0,h);sc.addColorStop(0,'rgba(6,12,30,.16)');sc.addColorStop(.55,'rgba(6,12,30,.26)');sc.addColorStop(1,'rgba(6,12,30,.55)');
    x.fillStyle=sc;x.fillRect(0,0,w,h);

    /* 2 · measure the text first, so the glass panel hugs it */
    const m=Math.round(w*.06),pw=w-m*2,padX=Math.round(u*.075),padY=Math.round(u*.06),tw=pw-padX*2,
          ps=Math.min(1.5,Math.max(.7,+o.pscale||1)),fh=P?Math.max(Math.round(u*.15*ps),Math.round(84*ps)):0,gap=Math.round(u*.035),
          labelS=Math.round(u*.034),refS=Math.round(u*.04),
          maxPanel=h-m*2-(P?fh+gap:0),
          G=String(o.greet||'').trim(),greetS=G?Math.round(u*.054):0,greetH=G?Math.round(greetS*1.55+gap*.5):0,
          DT=String(o.date||'').trim(),dateS=DT?Math.round(u*.03):0,dateH=DT?Math.round(dateS*1.5+gap*.3):0,
          maxText=maxPanel-padY*2-labelS*1.6-gap*2-refS*1.6-greetH-dateH;
    let fs=Math.round(u*.078*Math.min(1.4,Math.max(.7,+o.fscale||1))),lines=[],sp=0;
    const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),
          hs=o.hl===false?new Set():g.verseKey(words,o.hl),
          hlCol=o.hlColor||'#FFC93C',
          HF=o.hfont||'"Ponnala","Ramabhadra","Noto Serif Telugu",serif',
          hsc=Math.min(1.3,Math.max(.8,+o.hscale||1)),
          hf=i=>hs.has(i)?'400 '+Math.round(fs*hsc)+'px '+HF:'400 '+fs+'px '+fam;
    const wrap=()=>{
      lines=[];let cur=[],cw=0;x.font='400 '+fs+'px '+fam;sp=x.measureText(' ').width;
      words.forEach((wd,i)=>{
        x.font=hf(i);const ww=x.measureText(wd).width;
        if(cur.length&&cw+sp+ww>tw){lines.push(cur);cur=[];cw=0}
        cw+=(cur.length?sp:0)+ww;cur.push({i,t:wd,w:ww});
      });
      if(cur.length)lines.push(cur);
    };
    wrap();while(fs>22&&lines.length*fs*1.62>maxText){fs-=2;wrap()}
    const lh=fs*1.62,textH=lines.length*lh,
          ph=Math.round(padY*2+labelS*1.6+gap+textH+gap+refS*1.6+greetH+dateH),
          blockH=ph+(P?gap+fh:0),
          py=Math.round((h-blockH)/2),px=m,R=Math.round(u*.05);

    /* 3 · the glass: soft shadow, blurred copy of the photo, tint, sheen, bright edge */
    x.save();x.shadowColor='rgba(0,0,0,.38)';x.shadowBlur=u*.07;x.shadowOffsetY=u*.025;x.fillStyle='rgba(0,0,0,.22)';rr(x,px,py,pw,ph,R);x.fill();x.restore();
    x.save();rr(x,px,py,pw,ph,R);x.clip();
    if(blurOK){x.filter='blur('+Math.round(u*.035)+'px) saturate(1.5)';paint();x.filter='none'}
    x.fillStyle=blurOK?'rgba(10,18,42,.30)':'rgba(10,18,42,.52)';x.fillRect(px,py,pw,ph);
    const sh=x.createLinearGradient(px,py,px+pw*.7,py+ph);sh.addColorStop(0,'rgba(255,255,255,.30)');sh.addColorStop(.45,'rgba(255,255,255,.07)');sh.addColorStop(1,'rgba(255,255,255,.12)');
    x.fillStyle=sh;x.fillRect(px,py,pw,ph);
    x.restore();
    const eg=x.createLinearGradient(px,py,px+pw,py+ph);eg.addColorStop(0,'rgba(255,255,255,.85)');eg.addColorStop(.35,'rgba(255,255,255,.18)');eg.addColorStop(.7,'rgba(255,255,255,.14)');eg.addColorStop(1,'rgba(255,255,255,.55)');
    x.strokeStyle=eg;x.lineWidth=Math.max(1.5,u*.0028);rr(x,px+.75,py+.75,pw-1.5,ph-1.5,R);x.stroke();

    /* 4 · type: small label, hairline, the verse, the reference */
    x.textAlign='center';x.textBaseline='middle';
    if(G){      // greeting (Good morning …), shrunk if it is too wide for the panel
      let gs=greetS;x.font='400 '+gs+'px '+fam;while(gs>14&&x.measureText(G).width>tw){gs-=2;x.font='400 '+gs+'px '+fam}
      x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=u*.01;x.fillStyle=gold;x.fillText(G,w/2,py+padY+greetS*.8);x.shadowBlur=0;
    }
    let y=py+padY+greetH+labelS*.8;
    x.fillStyle='rgba(255,255,255,.82)';x.font='400 '+labelS+'px '+fam;
    x.fillText(o.title||'\u0C08 \u0C30\u0C4B\u0C1C\u0C41 \u0C35\u0C3E\u0C15\u0C4D\u0C2F\u0C02',w/2,y);
    y+=labelS*.8+gap*.45;
    x.fillStyle=gold;x.globalAlpha=.9;x.fillRect(w/2-u*.03,y,u*.06,Math.max(2,u*.003));x.globalAlpha=1;
    y+=gap*.55;
    lines.forEach((l,li)=>{
      const total=l.reduce((a,t)=>a+t.w,0)+sp*(l.length-1),ly=y+lh*(li+.5);
      let X=w/2-total/2;const pos=l.map(t=>{const r={x:X,t};X+=t.w+sp;return r});
      x.textAlign='left';x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=u*.012;x.shadowOffsetY=u*.003;
      pos.forEach(q=>{const on=hs.has(q.t.i);x.font=hf(q.t.i);x.fillStyle=on?hlCol:'#fff';x.fillText(q.t.t,q.x,ly)});
    });
    x.textAlign='center';
    x.shadowBlur=0;x.shadowOffsetY=0;
    y+=textH+gap*.9;
    x.fillStyle=gold;x.font='400 '+refS+'px '+fam;x.fillText(ref||'',w/2,y+refS*.8);
    if(DT){x.fillStyle='rgba(255,255,255,.78)';let ds=dateS;x.font='400 '+ds+'px '+fam;while(ds>10&&x.measureText(DT).width>tw){ds-=1;x.font='400 '+ds+'px '+fam}x.fillText(DT,w/2,y+refS*1.6+gap*.15+dateS*.7)}

    /* 5 · footer: pastor / church, in a small glass pill */
    if(P){
      const fy=py+ph+gap,r=fh/2;
      x.save();rr(x,m,fy,pw,fh,r);x.clip();
      if(blurOK){x.filter='blur('+Math.round(u*.03)+'px)';paint();x.filter='none'}
      x.fillStyle=blurOK?'rgba(10,18,42,.34)':'rgba(10,18,42,.55)';x.fillRect(m,fy,pw,fh);
      const s2=x.createLinearGradient(m,fy,m,fy+fh);s2.addColorStop(0,'rgba(255,255,255,.22)');s2.addColorStop(1,'rgba(255,255,255,.04)');x.fillStyle=s2;x.fillRect(m,fy,pw,fh);
      x.restore();
      x.strokeStyle='rgba(255,255,255,.45)';x.lineWidth=Math.max(1.5,u*.0025);rr(x,m+.75,fy+.75,pw-1.5,fh-1.5,r);x.stroke();
      const pr=fh*.44,cx=m+fh*.56,cy=fy+fh/2;let tx=m+fh*.5;
      if(o.photo){try{x.save();x.beginPath();x.arc(cx,cy,pr,0,7);x.clip();const iw=o.photo.width,ih=o.photo.height,s=Math.max(2*pr/iw,2*pr/ih);x.drawImage(o.photo,cx-iw*s/2,cy-ih*s/2,iw*s,ih*s);x.restore();
        x.strokeStyle='rgba(255,255,255,.8)';x.lineWidth=Math.max(2,u*.003);x.beginPath();x.arc(cx,cy,pr,0,7);x.stroke();tx=cx+pr+fh*.25}catch(e){try{x.restore()}catch(_){}}}
      const sub=[P.church,P.phone].filter(Boolean).join('   '),maxW=m+pw-fh*.4-tx;
      x.textAlign='left';x.textBaseline='middle';
      const put=(t,wt,sz,col,yy)=>{let s=sz;x.font=wt+' '+s+'px '+fam;while(s>10&&x.measureText(t).width>maxW){s-=1;x.font=wt+' '+s+'px '+fam}x.fillStyle=col;x.fillText(t,tx,yy)};
      if(P.name&&sub){put(P.name,'400',Math.round(fh*.27),'#fff',cy-fh*.15);put(sub,'400',Math.round(fh*.2),gold,cy+fh*.19)}
      else put(P.name||sub,'400',Math.round(fh*.28),'#fff',cy);
    }
    return c;
  };
})(typeof self!=='undefined'?self:window);
