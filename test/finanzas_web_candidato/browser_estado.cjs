'use strict';
const fs=require('node:fs'),path=require('node:path');
if(process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_TOKEN||process.env.GOOGLE_OAUTH_ACCESS_TOKEN)throw Error('Sin credenciales reales');
Object.assign(process.env,{GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FUNCTIONS_EMULATOR:'true'});
require('../finanzas_release7/red_local.cjs');require('../../functions/finanzas_v1/entorno').entorno();
const out=path.resolve(__dirname,'../../docs/finanzas_web_candidato_2026-10-28/browser');
const fixture=JSON.parse(fs.readFileSync(path.join(out,'fixture.json')));
if(fixture.proyecto!=='demo-fesync'||!fixture.iglesiaId.startsWith('fin_web_browser_'))throw Error('Solo fixture navegador');
async function main(){
  const tag=process.argv[2];if(!/^[a-z0-9_-]+$/.test(tag)||process.argv.length!==3)throw Error('Etiqueta inválida');
  const db=require('../finanzas_mvp/soporte').abrir(),b='iglesias/'+fixture.iglesiaId,uid=fixture.actores.admin.uid;
  try{
    const movements=await db.collection(b+'/finanzas_movimientos').orderBy('secuencia').get();
    const receipts=await db.collection(`operaciones_financieras/${uid}/solicitudes`).get();
    const intents=await db.collection(`finanzas_mvp_solicitudes/${uid}/solicitudes`).get();
    const rejects=await db.collection(`finanzas_resoluciones/${uid}/solicitudes`).get();
    const periodo=(await db.doc(b+'/finanzas_control/periodo').get()).data();
    const protocolo=(await db.doc(b+'/finanzas_control/protocolo').get()).data();
    const saldos=await db.collection(b+'/finanzas_saldos').get();
    const r={proyecto:'demo-fesync',iglesiaId:fixture.iglesiaId,periodosAbiertos:periodo.periodosAbiertos,
      protocolo:protocolo.estado,epoca:protocolo.epoca,saldo:saldos.docs.reduce((a,d)=>a+d.data().saldoMinor,0),
      movimientos:movements.docs.map(d=>({id:d.id,secuencia:d.data().secuencia,clase:d.data().movimiento.clase,
        fechaContable:d.data().movimiento.fechaContable,periodoId:d.data().movimiento.periodoId})),
      recibos:receipts.docs.map(d=>d.id),intenciones:intents.docs.map(d=>({id:d.id,huella:d.data().huella})),rechazos:rejects.docs.map(d=>d.id)};
    fs.writeFileSync(path.join(out,'libro-'+tag+'.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));
  }finally{await db.terminate();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
