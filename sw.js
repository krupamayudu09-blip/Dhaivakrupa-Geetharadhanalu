const V='dk-v53';
try{importScripts('/verse-img.js')}catch(e){}
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(['/','/icon.svg'])));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method==='GET'&&(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com')){
    e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x})));return;
  }
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/admin')||u.pathname.startsWith('/api/')||u.pathname.startsWith('/.netlify/')||/\.apk$/i.test(u.pathname))return;
  if(u.pathname.startsWith('/bible/')){
    e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x})));return;
  }
  e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(h=>h||caches.match('/'))));
});

/* Web Push: YouTube live alert ({type:'live'}) or the daily Bible verse. The server only sends which verse; the text is read from the Bible files here. */
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json()}catch{}
  if(d.type==='live'&&/^[\w-]{11}$/.test(d.id||'')){
    e.waitUntil(self.registration.showNotification('\uD83D\uDD34 LIVE NOW'+(d.title?': '+d.title:''),{body:'Tap to watch the live stream',icon:'/icon.svg',badge:'/icon.svg',tag:'live',renotify:true,requireInteraction:true,data:{url:'/#/watch/'+d.id}}));
    return;
  }
  if(d.type==='short'&&/^[\w-]{11}$/.test(d.id||'')){
    e.waitUntil(self.registration.showNotification(d.count>1?'\uD83C\uDFAC '+d.count+' new Shorts':'\uD83C\uDFAC New Short',{body:d.title||'Tap to watch',icon:'/icon.svg',badge:'/icon.svg',image:'https://i.ytimg.com/vi/'+d.id+'/hqdefault.jpg',tag:'new-short',renotify:true,data:{url:'/#/short/'+d.id}}));
    return;
  }
  if(d.type==='greeting'&&/^[\w-]{4,40}$/.test(d.id||'')){        // message from the admin (text and/or picture); the app also shows it as a popup
    e.waitUntil((async()=>{
      try{(await clients.matchAll({type:'window',includeUncontrolled:true})).forEach(c=>c.postMessage({type:'greeting',id:d.id}))}catch{}
      await self.registration.showNotification(d.title||'\uD83D\uDE4F Greeting',{body:d.text||'',icon:'/icon.svg',badge:'/icon.svg',image:d.img?new URL(d.img,self.location.origin).href:undefined,tag:'greeting',renotify:true,data:{url:'/#/'}});
    })());
    return;
  }
  e.waitUntil((async()=>{
    const b=d.b||43,c=d.c||3,v=d.v||16;let body='',image,vt='',ref='',ttl='',P={},photo;
    try{
      const [bk,te]=await Promise.all([fetch('/bible/books.json').then(r=>r.json()),fetch('/bible/te/'+b+'.json').then(r=>r.json())]);
      vt=te[c-1][v-1];ref=bk[b-1].te+' '+c+':'+v;body=vt+'\n\u2014 '+ref;
    }catch{}
    try{P=await (await fetch('/pastor.json')).json();if(P.vi&&P.vi.greetOn&&P.vi.greet)ttl=P.vi.greet}catch{}     // greeting (if on) becomes the notification title
    try{                                              // the verse as a picture (Chrome / Android show it large in the notification)
      if(vt&&self.verseCanvas&&typeof OffscreenCanvas!=='undefined'){
        try{if(P.photo)photo=await createImageBitmap(await (await fetch(P.photo)).blob())}catch{}
        const n=Math.floor(Date.now()/864e5),T=self.verseTheme(b,c,v);                 // theme of the verse -> matching photo / painted scene
        const VI=P.vi||{};
        const hm=(VI.hls||[]).find(h=>h&&+h.book===b&&+h.chapter===c&&+h.verse===v&&h.phrase);
        self.VERSE_EXTRA_FONTS=[VI.font,VI.hlFont].filter(Boolean);
        await self.verseFonts();const bg=await self.verseBgFor(T.key,n,VI.bgs,{tries:2,ms:5000});          // Unicode Telugu font + a photo for this theme (null -> painted scenery)
        const bl=await verseCanvas(new OffscreenCanvas(1200,630),vt,ref,{theme:T.shape,pal:T.pal,bg,pastor:VI.showPastor===false?null:P,photo,accent:P.accent||undefined,title:VI.title||undefined,greet:VI.greetOn&&VI.greet?VI.greet:undefined,date:VI.dateOn?self.verseDate(VI.dateLang):undefined,hl:VI.hlOn===false?false:(hm?hm.phrase:undefined),hlColor:VI.hlColor||undefined,font:VI.font?'"'+VI.font+'","Ramabhadra","Noto Serif Telugu",serif':undefined,hfont:VI.hlFont?'"'+VI.hlFont+'","Ponnala","Ramabhadra",serif':undefined,fscale:(VI.textSize||100)/100,hscale:(VI.hlSize||100)/100,pscale:(VI.scale||100)/100}).convertToBlob({type:'image/jpeg',quality:.88});
        image=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(bl)});
      }
    }catch{image=undefined}
    await self.registration.showNotification(ttl||'\u0C08 \u0C30\u0C4B\u0C1C\u0C41 \u0C35\u0C3E\u0C15\u0C4D\u0C2F\u0C02',{body:body||'Open the app to read today\'s verse',icon:'/icon.svg',badge:'/icon.svg',image,tag:'daily-verse',data:{url:'/#/bible/'+(b-1)+'/'+c}});
  })());
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const w of l){if('focus' in w){if(w.navigate)w.navigate(url);return w.focus()}}
    return clients.openWindow(url);
  }));
});
