const T=(m)=>new Date(Date.now()-m*60000).toISOString();
window.__DB_SEED = {
  profiles:[
    {id:'t1',install_prompted_at:'2026-01-01',display_name:'Yuri',email:'p@x.com',role:'teacher',approved:true,nickname:null,avatar:null,birth_date:null,family_dm_ok:false},
    // Marta: menor (13 años) y sin permiso familiar · Luis: adulto
    {id:'s1',install_prompted_at:'2026-01-01',display_name:'Marta',email:'m@x.com',role:'student',approved:true,nickname:null,avatar:null,birth_date:'2013-05-10',family_dm_ok:false,bio:null},
    {id:'s2',install_prompted_at:'2026-01-01',display_name:'Luis',email:'l@x.com',role:'student',approved:true,nickname:'Lu',avatar:'javascript:alert(1)',birth_date:'2000-03-02',family_dm_ok:false,bio:'Bajista y fan del jazz',instrument:'bass',level:'intermediate',favorites:'Joe Pass, Jaco'},
    {id:'s3',display_name:'Nuevo',email:'n@x.com',role:'student',approved:false,nickname:null,avatar:null,birth_date:null,family_dm_ok:false}
  ],
  listening_items:[
    {id:'i1',title:'Kind of Blue',url:'https://open.spotify.com/album/x',kind:'album',brief:'Fíjate en los voicings',created_at:'2026-01-01'},
    {id:'i2',title:'Cliffs of Dover',url:'https://youtu.be/abc',kind:'song',brief:null,created_at:'2026-01-02'}
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
  notifications:[
    {id:'n1',user_id:'s1',kind:'dm',actor_id:'t1',target_id:'t1',extra:null,created_at:T(40),read_at:null,pushed_at:null}
  ]
};
