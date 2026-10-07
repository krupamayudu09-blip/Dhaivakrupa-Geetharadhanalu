const V='dk-v30';
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(['/','/icon.svg'])));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method==='GET'&&(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com')){
    e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x})));return;
  }
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/admin')||u.pathname.startsWith('/api/')||/\.apk$/i.test(u.pathname))return;
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
  e.waitUntil((async()=>{
    const b=d.b||43,c=d.c||3,v=d.v||16;let body='';
    try{
      const [bk,te]=await Promise.all([fetch('/bible/books.json').then(r=>r.json()),fetch('/bible/te/'+b+'.json').then(r=>r.json())]);
      body=te[c-1][v-1]+'\n\u2014 '+bk[b-1].te+' '+c+':'+v;
    }catch{}
    await self.registration.showNotification('\uD83D\uDCD6 \u0C08 \u0C30\u0C4B\u0C1C\u0C41 \u0C35\u0C3E\u0C15\u0C4D\u0C2F\u0C02',{body:body||'Open the app to read today\'s verse',icon:'/icon.svg',badge:'/icon.svg',tag:'daily-verse',data:{url:'/#/bible/'+(b-1)+'/'+c}});
  })());
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const w of l){if('focus' in w){if(w.navigate)w.navigate(url);return w.focus()}}
    return clients.openWindow(url);
  }));
});
