const $ = id => document.getElementById(id);
const names = {normal:'Normal activity',altercation:'Possible altercation',distress:'Possible distress',benign_loud:'Benign loud event',vape_only:'Vape-only reading',missing_data:'Missing sensor data'};
const labels = {NORMAL:'Normal activity',POSSIBLE_ALTERCATION:'Possible altercation',POSSIBLE_DISTRESS:'Possible distress',DATA_UNAVAILABLE:'Data unavailable'};
const initialAssessment = $('assessment-body').innerHTML;
const initialChart = $('chart').innerHTML;
let controller;
const escape = value => String(value ?? 'Unavailable').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const motion = value => value == null ? 'Unavailable' : value === 1 ? 'Detected' : 'None';
function drawChart(readings) {
 const w=600,h=250,left=40,right=16,top=20,bottom=175,plot=w-left-right;
 const max=Math.max(110,...readings.map(r=>r.noise_db ?? 0));
 const x=i=>left+(readings.length===1?plot/2:i*plot/(readings.length-1));
 const y=n=>bottom-(n/max)*(bottom-top);
 let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Noise in decibels and motion over the replay. Exact values are available in Reading details."><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#285fe8" stop-opacity=".14"/><stop offset="100%" stop-color="#285fe8" stop-opacity="0"/></linearGradient></defs>`;
 for(const n of [0,30,60,90]) svg+=`<line x1="${left}" y1="${y(n)}" x2="${w-right}" y2="${y(n)}" stroke="#e8edf4"/><text x="${left-9}" y="${y(n)+3}" text-anchor="end" fill="#75859a" font-size="10">${n}</text>`;
 svg+=`<text x="${left}" y="10" fill="#75859a" font-size="9">dB</text>`;
 let segment=[];
 const flush=()=>{if(!segment.length)return;const path=segment.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ');svg+=`<path d="${path} L${segment.at(-1)[0]},${bottom} L${segment[0][0]},${bottom} Z" fill="url(#fill)"/><path d="${path}" fill="none" stroke="#285fe8" stroke-width="2.5" stroke-linejoin="round"/>`;segment=[];};
 readings.forEach((r,i)=>{if(r.noise_db==null)flush();else segment.push([x(i),y(r.noise_db)]);});flush();
 readings.forEach((r,i)=>{if(r.noise_db!=null)svg+=`<circle cx="${x(i)}" cy="${y(r.noise_db)}" r="3.5" fill="#fff" stroke="#285fe8" stroke-width="2"><title>${escape(r.timestamp)}: ${r.noise_db} dB</title></circle>`;
 const barWidth=Math.min(28,plot/Math.max(readings.length,1)*.55);
 svg+=`<rect x="${x(i)-barWidth/2}" y="${r.motion===1?196:211}" width="${barWidth}" height="${r.motion===1?19:4}" rx="2" fill="${r.motion==null?'#ead1a6':r.motion===1?'#b9cced':'#e7edf6'}"><title>${escape(r.timestamp)}: motion ${motion(r.motion)}</title></rect>`;
 if(i===0||i===readings.length-1||i%Math.max(1,Math.ceil(readings.length/5))===0)svg+=`<text x="${x(i)}" y="240" text-anchor="middle" fill="#75859a" font-size="9">${escape(r.timestamp)}</text>`;});
 svg+='<text x="6" y="207" fill="#75859a" font-size="8">Motion</text></svg>'; $('chart').innerHTML=svg;
}
function render(data){
 const {readings,assessment:a}=data,latest=readings.at(-1)||{};
 $('location').textContent=a.location;$('location-detail').textContent=names[data.name]+' · Synthetic replay';
 $('feed-status').textContent=a.status==='DATA_UNAVAILABLE'?'Incomplete data':'Replay loaded';
 $('noise').innerHTML=latest.noise_db==null?'Unavailable':`${escape(latest.noise_db)} <em>dB</em>`;
 $('motion').textContent=motion(latest.motion);$('vape').textContent=latest.vape_index??'Unavailable';$('time').textContent=latest.timestamp??'Unavailable';
 $('timeline-subtitle').textContent='Noise intensity and detected movement';$('sample-count').textContent=`${readings.length} samples`;$('reading-count').textContent=`${readings.length} synthetic readings`;
 drawChart(readings);
 const normal=a.status==='NORMAL',unavailable=a.status==='DATA_UNAVAILABLE';
 $('assessment').className=`assessment panel ${normal?'normal':unavailable?'unavailable':'alert'}`;
 $('assessment-body').innerHTML=`<div class="assessment-icon">${normal?'✓':unavailable?'!':'⌁'}</div><h3>${escape(labels[a.status]||a.status)}</h3>${unavailable?'<p>Required sensor data is incomplete. No safety status is inferred.</p>':''}<ul>${a.reasons.map(r=>`<li>${escape(r)}</li>`).join('')}</ul><div class="action"><strong>Recommended next step</strong>${escape(a.recommended_action)}</div>${!normal&&!unavailable?`<div class="score"><span>Heuristic risk score</span><b>${a.risk_score}<span> / 100</span></b></div><p class="score-note">Prototype heuristic, not a calibrated probability or confidence value.</p>`:''}`;
 $('readings-body').innerHTML=readings.map(r=>`<tr><td>${escape(r.timestamp)}</td><td>${escape(r.location)}</td><td>${escape(r.noise_db)}</td><td>${motion(r.motion)}</td><td>${escape(r.vape_index)}</td></tr>`).join('');
}
const buttons=[...document.querySelectorAll('[data-scenario]')];
buttons.forEach(button=>button.addEventListener('click',async()=>{
 controller?.abort();const request=new AbortController();controller=request;
 $('error').hidden=true;buttons.forEach(b=>{b.disabled=true;});$('feed-status').textContent='Loading replay…';
 try{const response=await fetch(`/api/scenario?name=${encodeURIComponent(button.dataset.scenario)}`,{signal:request.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load scenario.');render(data);buttons.forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
 catch(error){if(error.name!=='AbortError'){$('error').textContent=`${error.message} Select a scenario to retry.`;$('error').hidden=false;$('feed-status').textContent='Replay unavailable';}}
 finally{if(controller===request)buttons.forEach(b=>b.disabled=false);}
}));
buttons.forEach(b=>b.setAttribute('aria-pressed','false'));
$('reset').addEventListener('click',()=>{
 controller?.abort();controller=null;buttons.forEach(b=>{b.disabled=false;b.classList.remove('active');b.setAttribute('aria-pressed','false');});
 $('location').textContent='Camera-restricted space';$('location-detail').textContent='Choose a scenario to explore sensor activity';$('feed-status').textContent='Awaiting scenario';
 for(const id of ['noise','motion','vape','time'])$(id).textContent='—';
 $('assessment').className='assessment panel';$('assessment-body').innerHTML=initialAssessment;$('chart').innerHTML=initialChart;
 $('timeline-subtitle').textContent='Noise and motion, viewed together.';$('sample-count').textContent='No samples loaded';$('reading-count').textContent='Explore the underlying metadata';$('readings-body').innerHTML='<tr><td colspan="5">Select a scenario to load readings.</td></tr>';$('error').hidden=true;
 document.querySelectorAll('details').forEach(d=>d.open=false);
});
