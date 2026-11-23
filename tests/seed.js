const T=(m)=>new Date(Date.now()-m*60000).toISOString();
// Fecha a N días de hoy a una hora concreta (hora local), para las clases de la Agenda
const D=(days,h,mi=0)=>{ const d=new Date(); d.setDate(d.getDate()+days); d.setHours(h,mi,0,0); return d.toISOString(); };
const M1=()=>{ const d=new Date(); d.setDate(1); d.setHours(0,30,0,0); return d.toISOString(); }; // día 1 del mes, 0:30
window.__DB_SEED = {
  profiles:[
    {id:'t1',install_prompted_at:'2026-01-01',display_name:'Yuri',email:'p@x.com',role:'teacher',approved:true,nickname:null,avatar:null,birth_date:null,family_dm_ok:false},
    // Marta: menor (13 años) y sin permiso familiar · Luis: adulto
    {id:'s1',install_prompted_at:'2026-01-01',display_name:'Marta',email:'m@x.com',role:'student',approved:true,nickname:null,avatar:null,birth_date:'2013-05-10',family_dm_ok:false,bio:null},
    {id:'s2',install_prompted_at:'2026-01-01',display_name:'Luis',email:'l@x.com',role:'student',approved:true,nickname:'Lu',avatar:'javascript:alert(1)',birth_date:'2000-03-02',family_dm_ok:false,bio:'Bajista y fan del jazz',instrument:'bass',level:'intermediate',favorites:'Joe Pass, Jaco'},
    {id:'s3',display_name:'Nuevo',email:'n@x.com',role:'student',approved:false,nickname:null,avatar:null,birth_date:null,family_dm_ok:false}
  ],
  listening_items:[
    {id:'i1',title:'Kind of Blue',url:'https://open.spotify.com/album/x',kind:'album',brief:'Fíjate en los voicings',created_at:'2026-01-01',duration_sec:2756,track_count:5,duration_partial:false},
    {id:'i2',title:'Cliffs of Dover',url:'https://youtu.be/abc',kind:'song',brief:null,created_at:'2026-01-02',duration_sec:431,track_count:null,duration_partial:false}
  ],
  listening_assignments:[
    {id:'a1',item_id:'i1',student_id:'s1',note:'Solo Marta',due_date:'2026-11-10',assigned_at:'2026-11-01',listened:false,listened_at:null,answers:{},updated_at:'2026-11-01T10:00:00Z'},
    {id:'a2',item_id:'i1',student_id:'s2',note:null,due_date:null,assigned_at:'2026-11-01',listened:true,listened_at:'x',answers:{likes:'Me flipa <b>el</b> bajo'},updated_at:T(60)},
    {id:'a3',item_id:'i2',student_id:'s2',note:null,due_date:'2026-12-30',assigned_at:'2026-11-02',listened:false,listened_at:null,answers:{},updated_at:'2026-11-02T10:00:00Z'}
  ],
  board_posts:[
    {id:'p1',author_id:'t1',title:'Clase del jueves cambia',body:'Pasa a las 18:00.\nMás info: https://example.com/clase. Y <img src=x onerror=alert(1)>',audience:'all',pinned:true,created_at:'2026-11-20T09:00:00Z',updated_at:'2026-11-20T09:00:00Z'},
    {id:'p2',author_id:'t1',title:'Solo para Marta',body:'Trae el metrónomo',audience:'selected',pinned:false,created_at:'2026-11-21T09:00:00Z',updated_at:'2026-11-21T09:00:00Z'},
    {id:'p3',author_id:'t1',title:'Secreto de Luis',body:'Esto no lo debe ver Marta',audience:'selected',pinned:false,created_at:'2026-11-21T10:00:00Z',updated_at:'2026-11-21T10:00:00Z'}
  ],
  board_recipients:[ {post_id:'p2',student_id:'s1'}, {post_id:'p3',student_id:'s2'} ],
  board_reads:[ {post_id:'p1',student_id:'s2',read_at:'2026-11-20T10:00:00Z'} ],
  feed_posts:[
    {id:'f1',author_id:'s2',body:'Estoy escuchando a Joe Pass, ¡qué barbaridad!',link_url:'https://open.spotify.com/album/z',created_at:T(300)},
    {id:'f2',author_id:'t1',body:'Bienvenidos al feed. Compartid aquí lo que os inspire.',link_url:null,created_at:T(200)},
    {id:'f3',author_id:'s1',body:'Mi reflexión sobre Kind of Blue',link_url:null,created_at:T(100)}
  ],
  feed_comments:[
    {id:'fc1',post_id:'f1',author_id:'s1',body:'Qué bueno, lo apunto',created_at:T(250)},
    {id:'fc2',post_id:'f2',author_id:'s2',body:'Gracias profe',created_at:T(150)}
  ],
  listening_comments:[
    {id:'lc1',item_id:'i1',author_id:'s2',body:'El bajo en So What es una pasada',created_at:T(90)},
    {id:'lc2',item_id:'i2',author_id:'s2',body:'Este solo es de otro planeta',created_at:T(80)}
  ],
  reactions:[
    {target_type:'feed_post',target_id:'f1',user_id:'s1',emoji:'love',created_at:T(200)},
    {target_type:'feed_post',target_id:'f1',user_id:'s2',emoji:'like',created_at:T(190)},
    {target_type:'listening_comment',target_id:'lc2',user_id:'s2',emoji:'wow',created_at:T(70)},
    {target_type:'listening_item',target_id:'i2',user_id:'s2',emoji:'like',created_at:T(70)}
  ],
  moderation_reports:[
    {id:'r1',reporter_id:'s2',target_type:'feed_comment',target_id:'fc1',reason:'No me gusta el tono',resolved:false,created_at:T(30)},
    {id:'r2',reporter_id:'s1',target_type:'feed_comment',target_id:'fc2',reason:null,resolved:false,created_at:T(20)}
  ],
  // Mensajes privados: uno antiguo Luis → Marta (de cuando tenía permiso; el profe NO debe verlo) y Yuri → Marta
  dm_messages:[
    {id:'d1',sender_id:'s2',recipient_id:'s1',body:'Mensaje privado entre alumnos',created_at:T(50),read_at:T(45)},
    {id:'d3',sender_id:'t1',recipient_id:'s1',body:'Marta, repasa el ejercicio de escalas',created_at:T(40),read_at:null}
  ],
  user_blocks:[],
  // Marta y Luis son compañeros (así ella puede mencionarle fuera de sus conversaciones)
  classmates:[ {id:'cm1',requester_id:'s2',addressee_id:'s1',status:'accepted',created_at:T(500),accepted_at:T(480)} ],
  notifications:[
    {id:'n1',user_id:'s1',kind:'dm',actor_id:'t1',target_id:'t1',extra:null,created_at:T(40),read_at:null,pushed_at:null}
  ]
  ,homework_tasks:[
    {id:'h1',student_id:'s1',title:'Pentatónica de La en las 5 posiciones',details:'A 80 bpm con metrónomo, subiendo y bajando.',due_date:null,done_at:null,created_by:'t1',created_at:T(900)},
    {id:'h2',student_id:'s1',title:'Acordes con cejilla: F y Bm',details:null,due_date:'2026-01-10',done_at:null,created_by:'t1',created_at:T(800)},
    {id:'h3',student_id:'s1',title:'Ritmo de rasgueo de la semana pasada',details:null,due_date:null,done_at:T(120),created_by:'t1',created_at:T(2000)},
    {id:'h4',student_id:'s2',title:'Walking bass sobre Autumn Leaves',details:'Mira https://youtu.be/abc',due_date:null,done_at:null,created_by:'t1',created_at:T(500)}
  ],
  payments_plans:[ {student_id:'s1',mode:'monthly',amount:60,note:null,updated_at:T(5000)}, {student_id:'s2',mode:'free',amount:null,note:'Intercambio',updated_at:T(5000)} ],
  payments_records:[]
  ,lessons:[
    {id:'l1',event_key:'luis@g|1',student_id:'s2',title:'Clase Luis',starts_at:D(1,18),ends_at:D(1,19),reminded_at:null,synced_at:T(5)},
    {id:'l2',event_key:'marta@g|1',student_id:'s1',title:'Guitarra Marta',starts_at:D(2,16,30),ends_at:D(2,17,30),reminded_at:null,synced_at:T(5)},
    {id:'l3',event_key:'marta@g|0',student_id:'s1',title:'Guitarra Marta',starts_at:M1(),ends_at:M1(),reminded_at:M1(),synced_at:T(5)},
    {id:'l4',event_key:'x@g|1',student_id:null,title:'Clase Pedro (prueba)',starts_at:D(1,20),ends_at:D(1,21),reminded_at:null,synced_at:T(5)}
  ],
  lessons_students:[],
  lessons_sync:[ {id:1,last_run_at:T(5),last_ok_at:T(5),last_error:null,events:4,unmatched:1} ]
};
