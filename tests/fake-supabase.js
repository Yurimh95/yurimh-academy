// Supabase falso en memoria que IMITA las reglas RLS de supabase.sql (solo para pruebas)
(function(){
  const uid = p => p + Math.random().toString(16).slice(2,10);
  const DB = window.__DB = JSON.parse(JSON.stringify(window.__DB_SEED));
  let me = window.__ME || null;
  const listeners = [];
  const P = () => DB.profiles.find(x => x.id === me);
  const isTeacher = () => !!P() && P().role==='teacher' && P().approved;
  const isApproved = () => !!P() && P().approved;
  const assigned = itemId => DB.listening_assignments.some(a=>a.item_id===itemId && a.student_id===me);
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
    moderation_reports: r => isTeacher() || r.reporter_id===me
  };
  function canSee(type,id){
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
    moderation_reports: () => isTeacher()
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
    moderation_reports: r => r.reporter_id===me && isApproved() && ['feed_post','feed_comment','listening_comment'].includes(r.target_type) && canSee(r.target_type,r.target_id)
  };
  const checks = {
    feed_posts: r => r.body && r.body.length<=2000 && (!r.link_url || (/^https?:\/\//i.test(r.link_url) && r.link_url.length<=500)),
    feed_comments: r => r.body && r.body.length<=1000,
    listening_comments: r => r.body && r.body.length<=1000,
    reactions: r => ['like','love','laugh','wow','sad','angry'].includes(r.emoji) && ['board_post','feed_post','feed_comment','listening_comment','listening_item'].includes(r.target_type)
  };
  const typeOf = {board_posts:'board_post',feed_posts:'feed_post',feed_comments:'feed_comment',listening_comments:'listening_comment',listening_items:'listening_item'};
  function cleanup(table, rows){
    if(!typeOf[table]) return;
    const ids=new Set(rows.map(r=>r.id));
    DB.reactions=DB.reactions.filter(x=>!(x.target_type===typeOf[table] && ids.has(x.target_id)));
    DB.moderation_reports=DB.moderation_reports.filter(x=>!(x.target_type===typeOf[table] && ids.has(x.target_id)));
  }
  function cascade(table, rows){
    const ids=new Set(rows.map(r=>r.id));
    if(table==='feed_posts'){ const cs=DB.feed_comments.filter(c=>ids.has(c.post_id)); DB.feed_comments=DB.feed_comments.filter(c=>!ids.has(c.post_id)); cleanup('feed_comments',cs); }
    if(table==='listening_items'){ const cs=DB.listening_comments.filter(c=>ids.has(c.item_id)); DB.listening_comments=DB.listening_comments.filter(c=>!ids.has(c.item_id)); cleanup('listening_comments',cs); DB.listening_assignments=DB.listening_assignments.filter(a=>!ids.has(a.item_id)); }
    if(table==='board_posts'){ DB.board_recipients=DB.board_recipients.filter(r=>!ids.has(r.post_id)); DB.board_reads=DB.board_reads.filter(r=>!ids.has(r.post_id)); }
    cleanup(table,rows);
  }
  function guard(table, old, nw){
    if (table==='profiles' && !isTeacher()) {
      if (nw.role!==old.role || nw.approved!==old.approved || nw.email!==old.email || nw.id!==old.id) throw new Error('Solo el profesor puede modificar esos campos');
    }
    if (table==='profiles'){
      nw.display_name=String(nw.display_name).trim(); if(nw.display_name.length<1||nw.display_name.length>60) throw new Error('El nombre debe tener entre 1 y 60 caracteres');
      nw.nickname=(nw.nickname==null||String(nw.nickname).trim()==='')?null:String(nw.nickname).trim();
      if(nw.nickname && nw.nickname.length>30) throw new Error('violates check constraint nickname');
      if(nw.avatar!=null && !(nw.avatar.length<=40000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(nw.avatar))) throw new Error('violates check constraint avatar');
    }
    if (table==='listening_assignments' && !isTeacher()) {
      if (nw.item_id!==old.item_id||nw.student_id!==old.student_id||nw.note!==old.note||nw.due_date!==old.due_date) throw new Error('Solo el profesor puede modificar esos campos');
    }
    if (table==='listening_assignments' && (JSON.stringify(nw.answers)!==JSON.stringify(old.answers)||nw.listened!==old.listened)) nw.updated_at=new Date().toISOString();
    if (table==='board_posts') nw.updated_at=new Date().toISOString();
  }
  const pk = { board_reads:['post_id','student_id'], board_recipients:['post_id','student_id'], reactions:['target_type','target_id','user_id','emoji'] };

  function q(table){
    const st={op:'select',filters:[],order:null,payload:null,embed:false,single:false,maybe:false,opts:null,lim:null};
    const b={
      select(cols){ if(cols&&cols.includes('item:listening_items(*)')) st.embed=true; st.sel=true; return b; },
      eq(k,v){ st.filters.push([k,v]); return b; },
      order(k,o){ st.order=[k,!o||o.ascending!==false]; return b; },
      limit(n){ st.lim=n; return b; },
      update(p){ st.op='update'; st.payload=p; st.sel=false; return b; },
      insert(p){ st.op='insert'; st.payload=p; st.sel=false; return b; },
      upsert(p,o){ st.op='upsert'; st.payload=p; st.opts=o||{}; st.sel=false; return b; },
      delete(){ st.op='delete'; return b; },
      single(){ st.single=true; return b; },
      maybeSingle(){ st.maybe=true; return b; },
      then(res,rej){ return Promise.resolve().then(run).then(res,rej); }
    };
    function match(r){ return st.filters.every(([k,v])=>r[k]===v); }
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
        return finish(rows);
      }
      if(st.op==='update'){
        const rows=DB[table].filter(canRead[table]).filter(match).filter(r=>canWriteRow[table]('update',r));
        try{ const done=rows.map(r=>{ const nw={...r,...st.payload}; guard(table,r,nw); return [r,nw]; }); done.forEach(([r,nw])=>Object.assign(r,nw)); }catch(e){ return finish([],e.message); }
        return st.sel?finish(rows):{data:null,error:null};
      }
      if(st.op==='insert'||st.op==='upsert'){
        const arr=[].concat(st.payload); const made=[];
        for(const x of arr){
          const row={id:pk[table]?undefined:uid('n'),created_at:new Date().toISOString(),assigned_at:new Date().toISOString(),listened:false,answers:{},...x};
          if(table==='board_reads') row.read_at=new Date().toISOString();
          if(table==='board_posts'){ row.pinned=!!row.pinned; row.updated_at=row.created_at; }
          if(table==='moderation_reports') row.resolved=false;
          if(pk[table]) delete row.id;
          if(table!=='listening_assignments'){ delete row.assigned_at; delete row.listened; delete row.answers; }
          if(checks[table] && !checks[table](row)) return finish([], 'new row for relation "'+table+'" violates check constraint');
          if(!canInsert[table](row)) return finish([], 'new row violates row-level security policy for table "'+table+'"');
          if(pk[table] && DB[table].some(e=>pk[table].every(k=>e[k]===row[k]))){ if(st.op==='upsert'&&st.opts.ignoreDuplicates) continue; return finish([],'duplicate key value violates unique constraint'); }
          if(table==='moderation_reports' && DB[table].some(e=>e.reporter_id===row.reporter_id&&e.target_type===row.target_type&&e.target_id===row.target_id)) return finish([],'duplicate key value violates unique constraint');
          if(table==='listening_assignments' && DB[table].some(e=>e.item_id===row.item_id&&e.student_id===row.student_id)) return finish([],'duplicate key value');
          DB[table].push(row); made.push(row);
        }
        return st.sel?finish(made):{data:null,error:null};
      }
      if(st.op==='delete'){
        const rows=DB[table].filter(canRead[table]).filter(match).filter(r=>canWriteRow[table]('delete',r));
        DB[table]=DB[table].filter(r=>!rows.includes(r));
        cascade(table,rows);
        return {data:null,error:null};
      }
    }
    return b;
  }
  const rpc = name => Promise.resolve().then(()=>{
    if(name!=='get_directory') return {data:null,error:{message:'function public.'+name+' does not exist'}};
    if(!me) return {data:null,error:{message:'No autenticado'}};
    const rows = isApproved()? DB.profiles.filter(p=>p.approved).map(p=>({id:p.id,public_name:(p.nickname&&p.nickname.trim())||p.display_name,avatar:p.avatar||null,role:p.role})) : [];
    return {data:rows,error:null};
  });
  window.supabase={createClient(){ return {
    from:q, rpc,
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
