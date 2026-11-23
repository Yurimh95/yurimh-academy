// Supabase falso en memoria que IMITA las reglas RLS de supabase.sql (solo para pruebas)
(function(){
  const uid = p => p + Math.random().toString(16).slice(2,10);
  // __DB_OVERRIDE: para que una prueba continúe con el estado que dejó otra sesión (otra persona)
  const DB = window.__DB = JSON.parse(JSON.stringify(window.__DB_OVERRIDE || window.__DB_SEED));
  let me = window.__ME || null;
  const listeners = [];
  const P = () => DB.profiles.find(x => x.id === me);
  const isTeacher = () => !!P() && P().role==='teacher' && P().approved;
  const isApproved = () => !!P() && P().approved;
  const assigned = itemId => DB.listening_assignments.some(a=>a.item_id===itemId && a.student_id===me);
  // ---- Mensajes privados: misma lógica que dm_ok / can_dm del SQL ----
  const ageOf = iso => { if(!iso) return null; const [y,m,d]=iso.split('-').map(Number), t=new Date(); return t.getFullYear()-y-((t.getMonth()+1<m||(t.getMonth()+1===m&&t.getDate()<d))?1:0); };
  const prof = id => DB.profiles.find(x=>x.id===id);
  const dmOk = id => { const p=prof(id); return !!p && p.approved && (p.role==='teacher' || p.family_dm_ok || (ageOf(p.birth_date)!==null && ageOf(p.birth_date)>=18)); };
  const canDm = (a,b) => { const pa=prof(a), pb=prof(b); if(!pa||!pb||a===b||!pa.approved||!pb.approved) return false;
    if(pa.role==='teacher'||pb.role==='teacher') return true;
    return dmOk(a) && dmOk(b) && !DB.user_blocks.some(x=>(x.blocker_id===a&&x.blocked_id===b)||(x.blocker_id===b&&x.blocked_id===a)); };
  const dmReported = id => DB.moderation_reports.some(x=>x.target_type==='dm_message'&&x.target_id===id);
  // ---- Compañeros y quién ve a quién: misma lógica que has_public_activity / can_see_profile / can_request_classmate ----
  DB.classmates = DB.classmates || [];
  const hasActivity = u => DB.feed_posts.some(r=>r.author_id===u) || DB.feed_comments.some(r=>r.author_id===u)
    || DB.listening_comments.some(r=>r.author_id===u) || DB.reactions.some(r=>r.user_id===u);
  const mateBetween = (a,b) => DB.classmates.some(c=>(c.requester_id===a&&c.addressee_id===b)||(c.requester_id===b&&c.addressee_id===a));
  const dmBetween = (a,b) => DB.dm_messages.some(m=>(m.sender_id===a&&m.recipient_id===b)||(m.sender_id===b&&m.recipient_id===a));
  const blockedEither = (a,b) => DB.user_blocks.some(x=>(x.blocker_id===a&&x.blocked_id===b)||(x.blocker_id===b&&x.blocked_id===a));
  const canSeeProfile = u => { const p=prof(u); if(!p||!p.approved||!isApproved()) return false;
    return u===me || isTeacher() || p.role==='teacher' || hasActivity(u) || mateBetween(me,u) || dmBetween(me,u); };
  const canRequestMate = u => { const pm=P(), pu=prof(u);
    return u!==me && !!pm && pm.approved && pm.role==='student' && !!pu && pu.approved && pu.role==='student'
      && !blockedEither(me,u) && (hasActivity(u) || dmBetween(me,u)); };
  window.__canSeeProfile = canSeeProfile; // para las pruebas
  const postVisibleToMe = post => isTeacher() || (isApproved() && (post.audience==='all' || DB.board_recipients.some(r=>r.post_id===post.id && r.student_id===me)));

  const canRead = {
    profiles: r => r.id===me || isTeacher(),
    listening_items: r => isTeacher() || (isApproved() && assigned(r.id)),
    listening_assignments: r => isTeacher() || (r.student_id===me && isApproved()),
    board_posts: r => postVisibleToMe(r),
    board_recipients: r => isTeacher() || (r.student_id===me && isApproved()),
    board_reads: r => isTeacher() || r.student_id===me,
    feed_posts: () => isApproved(),
    feed_comments: () => isApproved(),
    listening_comments: r => isTeacher() || (isApproved() && assigned(r.item_id)),
    reactions: r => isApproved() && canSee(r.target_type, r.target_id),
    moderation_reports: r => isTeacher() || r.reporter_id===me,
    dm_messages: r => r.sender_id===me || r.recipient_id===me || (isTeacher() && dmReported(r.id)),
    user_blocks: r => r.blocker_id===me,
    notifications: r => r.user_id===me,
    homework_tasks: r => isTeacher() || (r.student_id===me && isApproved()),
    payments_plans: () => isTeacher(),
    payments_records: () => isTeacher(),
    lessons: r => isTeacher() || (r.student_id===me && isApproved()),
    lessons_students: () => isTeacher(),
    lessons_sync: () => isTeacher(),
    classmates: r => r.requester_id===me || r.addressee_id===me || isTeacher()
  };
  function canSee(type,id){
    if(type==='dm_message') return DB.dm_messages.some(r=>r.id===id && r.recipient_id===me);
    const T={board_post:['board_posts'],feed_post:['feed_posts'],feed_comment:['feed_comments'],listening_comment:['listening_comments'],listening_item:['listening_items']}[type];
    if(!T) return false;
    return DB[T[0]].some(r=>r.id===id && canRead[T[0]](r));
  }
  const own = r => r.author_id===me && isApproved();
  const canWriteRow = { // update/delete
    profiles: (op,r) => op==='update' && (isTeacher() || r.id===me),
    listening_items: () => isTeacher(),
    listening_assignments: (op,r) => op==='delete' ? isTeacher() : (isTeacher() || (r.student_id===me && isApproved())),
    board_posts: () => isTeacher(),
    board_recipients: () => isTeacher(),
    board_reads: () => false,
    feed_posts: (op,r) => op==='delete' && (isTeacher() || own(r)),
    feed_comments: (op,r) => op==='delete' && (isTeacher() || own(r)),
    listening_comments: (op,r) => op==='delete' && (isTeacher() || own(r)),
    reactions: (op,r) => op==='delete' && r.user_id===me,
    moderation_reports: () => isTeacher(),
    dm_messages: (op,r) => op==='update' ? r.recipient_id===me : (r.sender_id===me || (isTeacher() && dmReported(r.id))),
    user_blocks: (op,r) => op==='delete' && r.blocker_id===me,
    notifications: (op,r) => r.user_id===me,
    homework_tasks: (op,r) => op==='delete' ? isTeacher() : (isTeacher() || (r.student_id===me && isApproved())),
    payments_plans: () => isTeacher(),
    payments_records: () => isTeacher(),
    lessons: () => false,
    lessons_students: () => isTeacher(),
    lessons_sync: () => false,
    classmates: (op,r) => op==='update' ? r.addressee_id===me : (r.requester_id===me || r.addressee_id===me)
  };
  const canInsert = {
    profiles: () => false,
    listening_items: () => isTeacher(),
    listening_assignments: () => isTeacher(),
    board_posts: () => isTeacher(),
    board_recipients: () => isTeacher(),
    board_reads: r => r.student_id===me && isApproved() && DB.board_posts.some(p=>p.id===r.post_id && postVisibleToMe(p)),
    feed_posts: r => r.author_id===me && isApproved(),
    feed_comments: r => r.author_id===me && isApproved() && DB.feed_posts.some(p=>p.id===r.post_id),
    listening_comments: r => r.author_id===me && (isTeacher() || (isApproved() && assigned(r.item_id))),
    reactions: r => r.user_id===me && isApproved() && canSee(r.target_type,r.target_id),
    moderation_reports: r => r.reporter_id===me && isApproved() && ['feed_post','feed_comment','listening_comment','dm_message'].includes(r.target_type) && canSee(r.target_type,r.target_id),
    dm_messages: r => r.sender_id===me && isApproved() && canDm(me, r.recipient_id),
    user_blocks: r => r.blocker_id===me && isApproved() && r.blocker_id!==r.blocked_id,
    notifications: () => false,
    homework_tasks: () => isTeacher(),
    payments_plans: () => isTeacher(),
    payments_records: () => isTeacher(),
    lessons: () => false,
    lessons_students: () => isTeacher(),
    lessons_sync: () => false,
    classmates: r => r.requester_id===me && r.status==='pending' && !r.accepted_at && canRequestMate(r.addressee_id)
  };
  const checks = {
    feed_posts: r => r.body && r.body.length<=2000 && (!r.link_url || (/^https?:\/\//i.test(r.link_url) && r.link_url.length<=500)),
    feed_comments: r => r.body && r.body.length<=1000,
    listening_comments: r => r.body && r.body.length<=1000,
    dm_messages: r => r.body && r.body.length<=2000 && r.sender_id!==r.recipient_id,
    homework_tasks: r => r.title && String(r.title).trim().length>=1 && String(r.title).length<=200 && (!r.details || r.details.length<=1500),
    payments_records: r => /^\d{4}-\d{2}-01$/.test(r.period) && ['monthly','class'].includes(r.kind) && (r.amount==null || (r.amount>=0 && r.amount<100000)),
    payments_plans: r => ['monthly','per_class','free'].includes(r.mode) && (r.amount==null || (r.amount>=0 && r.amount<100000)),
    reactions: r => ['like','love','laugh','wow','sad','angry'].includes(r.emoji) && ['board_post','feed_post','feed_comment','listening_comment','listening_item'].includes(r.target_type)
  };
  const typeOf = {board_posts:'board_post',feed_posts:'feed_post',feed_comments:'feed_comment',listening_comments:'listening_comment',listening_items:'listening_item'};
  const pk = { board_reads:['post_id','student_id'], board_recipients:['post_id','student_id'], reactions:['target_type','target_id','user_id','emoji'], user_blocks:['blocker_id','blocked_id'], payments_plans:['student_id'], lessons_students:['student_id'] };

  // ---- Notificaciones: imitan los triggers notify_trg del SQL ----
  function notify(user, kind, actor, target, extra){
    if(!user || user===actor) return;
    if(DB.notifications.some(n=>n.user_id===user&&n.kind===kind&&(n.actor_id||null)===(actor||null)&&(n.target_id||null)===(target||null)&&!n.read_at)) return;
    const n={id:uid('nt'),user_id:user,kind,actor_id:actor||null,target_id:target||null,extra:extra==null?null:String(extra).slice(0,160),created_at:new Date().toISOString(),read_at:null,pushed_at:null};
    DB.notifications.push(n); emit('notifications','INSERT',n);
  }
  // Menciones: imitan mention_ids / mention_plain del SQL
  const mentionIds=t=>[...new Set([...String(t||'').matchAll(/<@([0-9a-z_-]+)>/g)].map(m=>m[1]))];
  const mentionPlain=t=>String(t||'').replace(/<@([0-9a-z_-]+)>/g,(m,id)=>{ const p=DB.profiles.find(x=>x.id===id); return '@'+(p?((p.nickname||'').trim()||p.display_name):'usuario'); }).replace(/<#l:[0-9a-z_-]+>/g,'#escucha').replace(/<#([a-z]+)>/g,'#$1');
  const blockedBy=(u,author)=>DB.user_blocks.some(b=>b.blocker_id===u&&b.blocked_id===author);
  function notifyFor(table,row){
    const teachers=()=>DB.profiles.filter(p=>p.role==='teacher'&&p.approved).map(p=>p.id);
    const approvedIds=ids=>ids.filter(u=>DB.profiles.some(p=>p.id===u&&p.approved));
    if(table==='board_posts' && row.audience==='all') DB.profiles.filter(p=>p.role==='student'&&p.approved).forEach(p=>notify(p.id,mentionIds(row.body).includes(p.id)?'mention_board':'board_post',row.author_id,row.id,row.title));
    if(table==='board_recipients'){ const bp=DB.board_posts.find(p=>p.id===row.post_id)||{}; notify(row.student_id,mentionIds(bp.body).includes(row.student_id)?'mention_board':'board_post',bp.author_id,bp.id,bp.title); }
    if(table==='feed_posts') approvedIds(mentionIds(row.body)).filter(u=>!blockedBy(u,row.author_id)).forEach(u=>notify(u,'mention_feed',row.author_id,row.id,mentionPlain(row.body).slice(0,120)));
    if(table==='feed_comments'){ const fp=DB.feed_posts.find(p=>p.id===row.post_id)||{}; approvedIds(mentionIds(row.body)).filter(u=>u!==fp.author_id&&!blockedBy(u,row.author_id)).forEach(u=>notify(u,'mention_feed',row.author_id,row.post_id,mentionPlain(row.body).slice(0,120))); }
    if(table==='listening_comments') approvedIds(mentionIds(row.body)).filter(u=>!blockedBy(u,row.author_id)&&(teachers().includes(u)||DB.listening_assignments.some(a=>a.item_id===row.item_id&&a.student_id===u))).forEach(u=>notify(u,'mention_listening',row.author_id,row.item_id,mentionPlain(row.body).slice(0,120)));
    if(table==='listening_assignments'){ const it=DB.listening_items.find(i=>i.id===row.item_id)||{}; notify(row.student_id,'assignment',null,row.item_id,it.title); }
    if(table==='dm_messages') notify(row.recipient_id,'dm',row.sender_id,row.sender_id,null);
    if(table==='feed_comments'){ const fp=DB.feed_posts.find(p=>p.id===row.post_id)||{}; notify(fp.author_id,'comment',row.author_id,row.post_id,mentionPlain(row.body).slice(0,80)); }
    if(table==='reactions' && row.target_type==='feed_post'){ const fp=DB.feed_posts.find(p=>p.id===row.target_id)||{}; notify(fp.author_id,'reaction',row.user_id,row.target_id,row.emoji); }
    if(table==='profiles') teachers().forEach(t=>notify(t,'signup',row.id,row.id,row.display_name));
    if(table==='moderation_reports') teachers().forEach(t=>notify(t,'report',null,row.id,null));
    if(table==='homework_tasks') notify(row.student_id,'homework',row.created_by,row.id,row.title);
    if(table==='classmates') notify(row.addressee_id,'classmate_request',row.requester_id,row.requester_id,null);
    // Al bloquear, la relación de compañeros se borra (trigger user_blocks_classmates_trg)
    if(table==='user_blocks') removeRows('classmates',c=>(c.requester_id===row.blocker_id&&c.addressee_id===row.blocked_id)||(c.requester_id===row.blocked_id&&c.addressee_id===row.blocker_id));
  }

  // ---- Tiempo real simulado: como Supabase Realtime, INSERT/UPDATE solo llegan si RLS deja leer la fila;
  //      los DELETE llegan a todos, pero solo con la clave primaria.
  const channels=[];
  function emit(table, eventType, row){
    const snap={...row};
    setTimeout(()=>{ channels.forEach(ch=>ch.handlers.filter(h=>h.table===table).forEach(h=>{
      if(!me) return;
      if(eventType!=='DELETE' && !canRead[table](DB[table].find(r=>(pk[table]||['id']).every(k=>r[k]===snap[k]))||snap)) return;
      const old={}; if(eventType==='DELETE') (pk[table]||['id']).forEach(k=>old[k]=snap[k]);
      h.cb({eventType, table, schema:'public', new: eventType==='DELETE'?{}:{...snap}, old});
    })); }, 15);
  }
  function removeRows(table, pred){ const gone=DB[table].filter(pred); DB[table]=DB[table].filter(r=>!pred(r)); gone.forEach(r=>emit(table,'DELETE',r)); return gone; }
  // Para las pruebas: simula que OTRA persona inserta/borra algo (window.__rtExternal('feed_posts', {...}))
  window.__rtExternal=(table,row)=>{ const r={created_at:new Date().toISOString(),...row}; DB[table].push(r); emit(table,'INSERT',r); notifyFor(table,r); return r; };
  window.__rtExternalUpdate=(table,id,patch)=>{ const r=DB[table].find(x=>x.id===id); Object.assign(r,patch); emit(table,'UPDATE',r); };
  window.__rtExternalDelete=(table,id)=>{ const rows=removeRows(table,r=>r.id===id); cascade(table,rows); };

  function cleanup(table, rows){
    if(!typeOf[table]) return;
    const ids=new Set(rows.map(r=>r.id));
    removeRows('reactions',x=>x.target_type===typeOf[table] && ids.has(x.target_id));
    removeRows('moderation_reports',x=>x.target_type===typeOf[table] && ids.has(x.target_id));
  }
  function cascade(table, rows){
    const ids=new Set(rows.map(r=>r.id));
    if(table==='feed_posts'){ const cs=removeRows('feed_comments',c=>ids.has(c.post_id)); cleanup('feed_comments',cs); }
    if(table==='listening_items'){ const cs=removeRows('listening_comments',c=>ids.has(c.item_id)); cleanup('listening_comments',cs); removeRows('listening_assignments',a=>ids.has(a.item_id)); }
    if(table==='board_posts'){ removeRows('board_recipients',r=>ids.has(r.post_id)); removeRows('board_reads',r=>ids.has(r.post_id)); }
    cleanup(table,rows);
  }
  function guard(table, old, nw){
    if (table==='profiles' && !isTeacher()) {
      if (nw.role!==old.role || nw.approved!==old.approved || nw.email!==old.email || nw.id!==old.id
          || !!nw.family_dm_ok!==!!old.family_dm_ok || (old.birth_date && nw.birth_date!==old.birth_date)) throw new Error('Solo el profesor puede modificar esos campos');
    }
    if (table==='dm_messages' && (nw.body!==old.body||nw.sender_id!==old.sender_id||nw.recipient_id!==old.recipient_id)) throw new Error('Solo se puede marcar como leído');
    if (table==='notifications' && (nw.kind!==old.kind||nw.user_id!==old.user_id||nw.extra!==old.extra)) throw new Error('Solo se puede marcar como leída');
    if (table==='profiles'){
      nw.display_name=String(nw.display_name).trim(); if(nw.display_name.length<1||nw.display_name.length>60) throw new Error('El nombre debe tener entre 1 y 60 caracteres');
      nw.nickname=(nw.nickname==null||String(nw.nickname).trim()==='')?null:String(nw.nickname).trim();
      if(nw.nickname && nw.nickname.length>30) throw new Error('violates check constraint nickname');
      if(nw.avatar!=null && !(nw.avatar.length<=40000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(nw.avatar))) throw new Error('violates check constraint avatar');
    }
    if (table==='profiles' && nw.avatar_src!=null && !(nw.avatar_src.length<=120000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(nw.avatar_src))) throw new Error('violates check constraint avatar_src');
    if (table==='listening_assignments' && !isTeacher()) {
      if (nw.item_id!==old.item_id||nw.student_id!==old.student_id||nw.note!==old.note||nw.due_date!==old.due_date) throw new Error('Solo el profesor puede modificar esos campos');
    }
    if (table==='listening_assignments' && (JSON.stringify(nw.answers)!==JSON.stringify(old.answers)||nw.listened!==old.listened)) nw.updated_at=new Date().toISOString();
    if (table==='board_posts') nw.updated_at=new Date().toISOString();
    if (table==='classmates'){
      if (nw.requester_id!==old.requester_id||nw.addressee_id!==old.addressee_id||old.status!=='pending'||nw.status!=='accepted') throw new Error('Solo se puede aceptar una solicitud pendiente');
      nw.accepted_at=new Date().toISOString();
    }
    if (table==='homework_tasks' && !isTeacher() && (nw.title!==old.title||nw.details!==old.details||nw.due_date!==old.due_date||nw.student_id!==old.student_id)) throw new Error('Solo puedes marcar tus deberes como practicados');
  }
  function q(table){
    const st={op:'select',filters:[],order:null,payload:null,embed:false,single:false,maybe:false,opts:null,lim:null};
    const b={
      select(cols){ if(cols&&cols.includes('item:listening_items(*)')) st.embed=true; st.sel=true; return b; },
      eq(k,v){ st.filters.push(r=>r[k]===v); return b; },
      gte(k,v){ st.filters.push(r=>r[k]!=null && r[k]>=v); return b; },
      lte(k,v){ st.filters.push(r=>r[k]!=null && r[k]<=v); return b; },
      is(k,v){ st.filters.push(r=>(r[k]??null)===v); return b; },
      in(k,arr){ st.filters.push(r=>arr.includes(r[k])); return b; },
      order(k,o){ st.order=[k,!o||o.ascending!==false]; return b; },
      limit(n){ st.lim=n; return b; },
      range(a,z){ st.rng=[a,z]; return b; },
      update(p){ st.op='update'; st.payload=p; st.sel=false; return b; },
      insert(p){ st.op='insert'; st.payload=p; st.sel=false; return b; },
      upsert(p,o){ st.op='upsert'; st.payload=p; st.opts=o||{}; st.sel=false; return b; },
      delete(){ st.op='delete'; return b; },
      single(){ st.single=true; return b; },
      maybeSingle(){ st.maybe=true; return b; },
      then(res,rej){ return Promise.resolve().then(run).then(res,rej); }
    };
    function match(r){ return st.filters.every(f=>f(r)); }
    function finish(rows,error){
      if(error) return {data:null,error:{message:error}};
      let out=rows.map(r=>({...r}));
      if(st.embed) out=out.map(r=>({...r,item:(DB.listening_items.find(i=>i.id===r.item_id && canRead.listening_items(i))||null)}));
      if(st.single) return out.length===1?{data:out[0],error:null}:{data:null,error:{message:'JSON object requested, multiple (or no) rows returned'}};
      if(st.maybe) return {data:out[0]||null,error:null};
      return {data:out,error:null};
    }
    function run(){
      if(!me) return {data:null,error:{message:'No autenticado'}};
      if(!DB[table]) return {data:null,error:{message:`relation "public.${table}" does not exist`}};
      if(st.op==='select'){
        let rows=DB[table].filter(canRead[table]).filter(match);
        if(st.order) rows.sort((a,b)=>(a[st.order[0]]>b[st.order[0]]?1:-1)*(st.order[1]?1:-1));
        if(st.lim) rows=rows.slice(0,st.lim);
        if(st.rng) rows=rows.slice(st.rng[0],st.rng[1]+1);
        return finish(rows);
      }
      if(st.op==='update'){
        const rows=DB[table].filter(canRead[table]).filter(match).filter(r=>canWriteRow[table]('update',r));
        try{ const done=rows.map(r=>{ const nw={...r,...st.payload}; guard(table,r,nw); return [r,nw]; }); done.forEach(([r,nw])=>{ const was=r.status; Object.assign(r,nw); emit(table,'UPDATE',r);
          if(table==='classmates' && was==='pending' && r.status==='accepted') notify(r.requester_id,'classmate_accept',r.addressee_id,r.addressee_id,null); }); }catch(e){ return finish([],e.message); }
        return st.sel?finish(rows):{data:null,error:null};
      }
      if(st.op==='insert'||st.op==='upsert'){
        const arr=[].concat(st.payload); const made=[];
        for(const x of arr){
          const row={id:pk[table]?undefined:uid('n'),created_at:new Date().toISOString(),assigned_at:new Date().toISOString(),listened:false,answers:{},...x};
          if(table==='board_reads') row.read_at=new Date().toISOString();
          if(table==='board_posts'){ row.pinned=!!row.pinned; row.updated_at=row.created_at; }
          if(table==='moderation_reports') row.resolved=false;
          if(table==='classmates'){ row.status=row.status||'pending'; row.accepted_at=row.accepted_at||null;
            if(mateBetween(row.requester_id,row.addressee_id)) return finish([],'duplicate key value violates unique constraint "classmates_pair_uq"'); }
          if(table==='homework_tasks'){ row.created_by=row.created_by||me; row.done_at=row.done_at||null; row.due_date=row.due_date||null; row.details=row.details||null; }
          if(table==='payments_records'){ row.paid_on=row.paid_on||new Date().toISOString().slice(0,10); if(row.kind==='monthly' && DB.payments_records.some(e=>e.kind==='monthly'&&e.student_id===row.student_id&&e.period===row.period)) return finish([],'duplicate key value violates unique constraint "payments_records_monthly_uq"'); }
          if(pk[table]) delete row.id;
          if(table!=='listening_assignments'){ delete row.assigned_at; delete row.listened; delete row.answers; }
          if(checks[table] && !checks[table](row)) return finish([], 'new row for relation "'+table+'" violates check constraint');
          if(!canInsert[table](row)) return finish([], 'new row violates row-level security policy for table "'+table+'"');
          if(pk[table] && DB[table].some(e=>pk[table].every(k=>e[k]===row[k]))){ if(st.op==='upsert'&&st.opts.ignoreDuplicates) continue; return finish([],'duplicate key value violates unique constraint'); }
          if(table==='moderation_reports' && DB[table].some(e=>e.reporter_id===row.reporter_id&&e.target_type===row.target_type&&e.target_id===row.target_id)) return finish([],'duplicate key value violates unique constraint');
          if(table==='listening_assignments' && DB[table].some(e=>e.item_id===row.item_id&&e.student_id===row.student_id)) return finish([],'duplicate key value');
          DB[table].push(row); made.push(row); emit(table,'INSERT',row); notifyFor(table,row);
        }
        return st.sel?finish(made):{data:null,error:null};
      }
      if(st.op==='delete'){
        const rows=DB[table].filter(canRead[table]).filter(match).filter(r=>canWriteRow[table]('delete',r));
        removeRows(table,r=>rows.includes(r));
        cascade(table,rows);
        return {data:null,error:null};
      }
    }
    return b;
  }
  const rpc = (name,args) => Promise.resolve().then(()=>{
    if(!me) return {data:null,error:{message:'No autenticado'}};
    if(name==='get_dm_contacts') return {data: DB.profiles.filter(p=>p.approved && canDm(me,p.id) && canSeeProfile(p.id)).map(p=>p.id), error:null};
    if(name==='can_dm') return {data: (args.a===me||args.b===me) && canDm(args.a,args.b), error:null}; // solo responde a los implicados
    if(name==='dm_ok') return {data:null, error:{message:'permission denied for function dm_ok'}};
    if(name==='get_profile'){ const p=prof(args.p_id); if(!p||!p.approved||!isApproved()||!canSeeProfile(p.id)) return {data:[],error:null};
      return {data:[{id:p.id,public_name:(p.nickname&&p.nickname.trim())||p.display_name,avatar:p.avatar||null,role:p.role,bio:p.bio||null,instrument:p.instrument||null,level:p.level||null,favorites:p.favorites||null,learning:p.learning||null,gear:p.gear||null,can_message:canDm(me,p.id)}],error:null}; }
    if(name!=='get_directory') return {data:null,error:{message:'function public.'+name+' does not exist'}};
    const rows = isApproved()? DB.profiles.filter(p=>p.approved && canSeeProfile(p.id)).map(p=>({id:p.id,public_name:(p.nickname&&p.nickname.trim())||p.display_name,avatar:p.avatar||null,role:p.role})) : [];
    return {data:rows,error:null};
  });
  window.supabase={createClient(){ return {
    from:q, rpc,
    channel(){ const ch={handlers:[], on(type,f,cb){ ch.handlers.push({table:f.table,cb}); return ch; }, subscribe(cb){ channels.push(ch); setTimeout(()=>cb&&cb('SUBSCRIBED'),0); return ch; }}; return ch; },
    removeChannel(ch){ const i=channels.indexOf(ch); if(i>=0) channels.splice(i,1); },
    auth:{
      getSession: async()=>({data:{session: me?{user:{id:me}}:null}}),
      onAuthStateChange(cb){ listeners.push(cb); return {data:{subscription:{}}}; },
      signOut: async()=>{ me=null; listeners.forEach(cb=>cb('SIGNED_OUT',null)); return {error:null}; },
      signInWithPassword: async()=>({error:null}),
      signUp: async()=>({data:{session:null},error:null}),
      updateUser: async(x)=>{ window.__lastPassword=x.password; return {error:null}; },
      resetPasswordForEmail: async()=>({error:null})
    }
  };}};
})();
