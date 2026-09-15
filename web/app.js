const $ = id => document.getElementById(id);
const names = {normal:'Normal activity',altercation:'Possible altercation',distress:'Possible distress',benign_loud:'Benign loud event',vape_only:'Vape-only reading',missing_data:'Missing sensor data'};
const labels = {NORMAL:'Normal activity',POSSIBLE_ALTERCATION:'Possible altercation',POSSIBLE_DISTRESS:'Possible distress',DATA_UNAVAILABLE:'Data unavailable'};
const initialAssessment = $('assessment-body').innerHTML;
const initialChart = $('chart').innerHTML;
let controller;
let selected = "normal", replay = null, cursor = 0, timer = null;
let running = false, paused = false, events = [], lastStatus = null, acknowledged = false;
const escape = value => String(value ?? 'Unavailable').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const motion = value => value == null ? 'Unavailable' : value === 1 ? 'Detected' : 'None';
function drawChart(readings) {
 const w=600,h=250,left=40,right=16,top=20,bottom=175,plot=w-left-right;
 const max=Math.max(110,...readings.map(r=>r.noise_db ?? 0));
 const x=i=>left+((replay?.readings.length ?? readings.length)===1?plot/2:i*plot/((replay?.readings.length ?? readings.length)-1));
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
 const trigger = replay?.frames.slice(0, readings.length).findIndex(frame => ['POSSIBLE_ALTERCATION', 'POSSIBLE_DISTRESS'].includes(frame.status)) ?? -1;
 if (trigger >= 0) svg += `<line x1="${x(trigger)}" y1="${top}" x2="${x(trigger)}" y2="${bottom}" stroke="#ba4248" stroke-dasharray="4 4"/><text x="${x(trigger)}" y="12" text-anchor="${trigger > readings.length / 2 ? 'end' : 'start'}" fill="#a63d44" font-size="10">Review triggered</text>`;
 svg+='<text x="6" y="207" fill="#75859a" font-size="8">Motion</text></svg>'; $('chart').innerHTML=svg;
}

// Timeline structure adapted from cnippet-dev's Incident Status Timeline on 21st.dev.
function addEvent(title, message, kind = 'info', time = null) {
  const followTrail = $('events').scrollHeight - $('events').scrollTop - $('events').clientHeight < 50;
  events.push({ title, message, kind, time: time ?? replay?.readings[Math.max(0, cursor - 1)]?.timestamp ?? 'Now' });
  $('events').innerHTML = events.map(event => `<li class="event-item ${event.kind}"><span class="event-node" aria-hidden="true"></span><div><div class="event-meta"><span class="event-badge">${escape(event.title)}</span><time>${escape(event.time)}</time></div><p>${escape(event.message)}</p></div></li>`).join('');
  $('event-count').textContent = `${events.length} events`;
  if (followTrail) $('events').scrollTop = $('events').scrollHeight;
}

function renderFrame() {
  const readings = replay.readings.slice(0, cursor);
  const a = replay.frames[cursor - 1];
  const latest = readings.at(-1);
  const normal = a.status === 'NORMAL';
  const unavailable = a.status === 'DATA_UNAVAILABLE';
  const complete = cursor === replay.readings.length;
  $('location').textContent = a.location;
  $('location-detail').textContent = `${names[selected]} · Scenario replay`;
  $('noise').innerHTML = latest.noise_db == null ? 'Unavailable' : `${escape(latest.noise_db)} <em>dB</em>`;
  $('motion').textContent = motion(latest.motion);
  $('vape').textContent = latest.vape_index ?? 'Unavailable';
  $('time').textContent = latest.timestamp;
  $('sample-count').textContent = `${cursor} of ${replay.readings.length} readings`;
  $('reading-count').textContent = `${cursor} readings received`;
  $('timeline-subtitle').textContent = 'Noise intensity and movement as readings arrive';
  drawChart(readings);
  $('assessment').className = `assessment panel ${normal ? 'normal' : unavailable ? 'unavailable' : 'alert'}`;
  const heading = normal ? (complete ? 'No alert pattern detected' : 'Building the picture') : labels[a.status];
  const detail = normal ? (complete ? 'This replay did not meet the noise-and-motion alert criteria.' : 'No alert criteria met so far. More readings may change the assessment.') : unavailable ? 'Required data is missing. The engine cannot infer a safety status.' : 'A pattern needs human review. This does not establish bullying or intent.';
  $('assessment-body').innerHTML = `<div class="assessment-icon">${normal ? (complete ? '✓' : '⌁') : unavailable ? '!' : 'ϟ'}</div><h3>${heading}</h3><p>${detail}</p>${!normal ? `<ul>${a.reasons.map(reason => `<li>${escape(reason)}</li>`).join('')}</ul>` : ''}<div class="action"><strong>${normal && !complete ? 'Next step' : 'Recommended next step'}</strong>${normal && !complete ? 'Keep observing the replay.' : escape(a.recommended_action)}</div>${!normal ? `<button id="acknowledge" class="review-button" ${acknowledged ? 'disabled' : ''}>${acknowledged ? '✓ Review acknowledged' : 'Acknowledge for review'}</button><p class="score-note">Demo action · recorded in this run only. No notification is sent.</p>` : ''}${!normal && !unavailable ? `<div class="score"><span>Heuristic risk score</span><b>${a.risk_score}<span> / 100</span></b></div><p class="score-note">Rule-based score, not a probability of harm.</p>` : ''}`;
  $('acknowledge')?.addEventListener('click', () => {
    acknowledged = true;
    addEvent('Acknowledged', 'Operator acknowledged this assessment for review. No external action was taken.', 'review');
    renderFrame();
  });
  $('readings-body').innerHTML = readings.map(r => `<tr><td>${escape(r.timestamp)}</td><td>${escape(r.location)}</td><td>${escape(r.noise_db)}</td><td>${motion(r.motion)}</td><td>${escape(r.vape_index)}</td></tr>`).join('');
  $('stage-signals').textContent = `${cursor} readings received`;
  $('stage-pattern').textContent = unavailable ? 'Missing required data' : normal ? 'No qualifying pattern yet' : 'Pattern threshold met';
  $('stage-response').textContent = normal ? (complete ? 'No intervention indicated' : 'Continue observing') : unavailable ? 'Check sensor data' : 'Welfare check recommended';
}

function updatePlayback() {
  const total = replay?.readings.length ?? 0;
  const complete = total > 0 && cursor === total;
  $('progress').value = total ? cursor / total * 100 : 0;
  $('progress-label').textContent = complete ? `Replay complete · ${total} readings` : paused ? `Paused · ${cursor} of ${total} readings` : running ? `Playing · ${cursor} of ${total} readings` : 'Ready to run';
  $('feed-status').textContent = paused ? 'Paused' : running ? 'Replay running' : complete ? 'Replay complete' : 'Awaiting scenario';
  $('engine-status').textContent = paused ? 'Paused' : running ? 'Evaluating incoming readings' : complete ? 'Analysis complete' : 'Standing by';
  $('engine-orbit').classList.toggle('running', running && !paused);
  $('run').textContent = total ? '↺ Restart simulation' : '▶ Run simulation';
  $('pause').disabled = !running;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
}

function schedule() {
  clearTimeout(timer);
  if (!running || paused) return;
  const seconds = value => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  const previous = replay.readings[cursor - 1]?.timestamp;
  const next = replay.readings[cursor]?.timestamp;
  const interval = previous && next ? Math.max(1, seconds(next) - seconds(previous)) : 5;
  timer = setTimeout(advance, interval * 1000 / Number($('speed').value));
}

function advance() {
  if (!running || paused) return;
  cursor += 1;
  const a = replay.frames[cursor - 1];
  const reading = replay.readings[cursor - 1];
  if (lastStatus !== a.status) acknowledged = false;
  const title = a.status === 'NORMAL' ? (reading.noise_db >= 85 ? 'Noise elevation' : 'Reading received') : labels[a.status];
  const message = a.status === 'NORMAL' ? `${reading.noise_db ?? 'Unavailable'} dB · Motion ${motion(reading.motion).toLowerCase()}. ${reading.noise_db >= 85 ? 'Noise alone is not enough to establish an incident.' : 'No alert criteria met at this point.'}` : a.reasons.join('. ');
  addEvent(title, message, a.status === 'NORMAL' ? 'info' : a.status === 'DATA_UNAVAILABLE' ? 'warning' : 'alert', reading.timestamp);
  lastStatus = a.status;
  renderFrame();
  if (cursor === replay.readings.length) {
    running = false;
    addEvent('Replay complete', 'All readings evaluated. Review the timeline and assessment.', 'complete');
  }
  updatePlayback();
  schedule();
}

function clearRun() {
  clearTimeout(timer);
  controller?.abort();
  controller = null;
  replay = null;
  cursor = 0;
  running = false;
  paused = false;
  events = [];
  lastStatus = null;
  acknowledged = false;
  $('run').disabled = false;
  $('error').hidden = true;
  $('location').textContent = 'Camera-restricted space';
  $('location-detail').textContent = 'Run a scenario to follow the evidence';
  for (const id of ['noise', 'motion', 'vape', 'time']) $(id).textContent = '—';
  $('assessment').className = 'assessment panel';
  $('assessment-body').innerHTML = initialAssessment;
  $('chart').innerHTML = initialChart;
  $('timeline-subtitle').textContent = 'Noise and motion, viewed together.';
  $('sample-count').textContent = 'Awaiting first reading';
  $('reading-count').textContent = 'Explore the underlying metadata';
  $('readings-body').innerHTML = '<tr><td colspan="5">Run a simulation to load readings.</td></tr>';
  $('events').innerHTML = '<li class="event-empty">The trail begins when you run a simulation.</li>';
  $('event-count').textContent = '0 events';
  $('stage-signals').textContent = 'Noise + motion';
  $('stage-pattern').textContent = 'Evaluate readings together';
  $('stage-response').textContent = 'Human review when needed';
  updatePlayback();
}

const buttons = [...document.querySelectorAll('[data-scenario]')];
function selectScenario(name) {
  clearRun();
  selected = name;
  $('selected-scenario').textContent = names[name];
  buttons.forEach(button => {
    const active = button.dataset.scenario === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
buttons.forEach(button => button.addEventListener('click', () => selectScenario(button.dataset.scenario)));
$('run').addEventListener('click', async () => {
  clearRun();
  const request = new AbortController();
  controller = request;
  $('run').disabled = true;
  $('run').textContent = 'Loading…';
  $('engine-status').textContent = 'Preparing replay';
  try {
    const response = await fetch(`/api/scenario?name=${encodeURIComponent(selected)}`, { signal: request.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load scenario.');
    if (!data.frames?.length || data.frames.length !== data.readings?.length) throw new Error('Replay data is incomplete. Restart the local server and try again.');
    if (controller !== request) return;
    replay = data;
    running = true;
    addEvent('Replay started', `${names[selected]} selected. Each assessment uses only readings received so far.`, 'info', data.readings[0].timestamp);
    advance();
  } catch (error) {
    if (error.name !== 'AbortError' && controller === request) {
      $('error').textContent = error.message;
      $('error').hidden = false;
      updatePlayback();
      $('engine-status').textContent = 'Unable to start';
    }
  } finally {
    if (controller === request) $('run').disabled = false;
  }
});
$('pause').addEventListener('click', () => {
  paused = !paused;
  clearTimeout(timer);
  addEvent(paused ? 'Paused' : 'Resumed', paused ? 'Replay paused by operator.' : 'Replay resumed by operator.');
  updatePlayback();
  schedule();
});
$('speed').addEventListener('change', schedule);
$('reset').addEventListener('click', () => {
  selectScenario('normal');
  document.querySelectorAll('details').forEach(details => details.open = false);
});
selectScenario('normal');
