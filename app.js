const D=window.FOCUS_DATA;
const $=id=>document.getElementById(id);
const nf=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2});
const colors={'Tuyên Quang':'#dc2626','Hà Nội':'#2563eb','Ninh Bình':'#15805d','Hà Tĩnh':'#d38513','Nghệ An':'#6b5bb5'};
const charts={};
const pointsByGroup=new Map();
let selectedSubject='Toán';
let selectedScale='room';
let selectedSuspect=null;

function init(){
  if(!D?.suspects?.length||!window.echarts)return;
  D.points.forEach(point=>{if(!pointsByGroup.has(point.group_id))pointsByGroup.set(point.group_id,[]);pointsByGroup.get(point.group_id).push(point)});
  $('subjectTabs').innerHTML=D.meta.subjects.map(subject=>`<button class="subject-tab" data-subject="${escapeHtml(subject)}">${escapeHtml(subject)}</button>`).join('');
  document.querySelectorAll('[data-subject]').forEach(button=>button.addEventListener('click',()=>selectSubject(button.dataset.subject)));
  $('groupSizeTabs').innerHTML=D.meta.group_scales.map(scale=>`<button class="subject-tab" data-scale="${scale.id}">${scale.label}</button>`).join('');
  document.querySelectorAll('[data-scale]').forEach(button=>button.addEventListener('click',()=>selectScale(button.dataset.scale)));
  window.addEventListener('resize',()=>Object.values(charts).forEach(chart=>chart.resize()));
  const params=new URLSearchParams(window.location.search);
  const requestedScale=params.get('scale');
  const requestedSubject=params.get('subject');
  selectScale(D.meta.group_scales.some(scale=>scale.id===requestedScale)?requestedScale:'room');
  selectSubject(D.meta.subjects.includes(requestedSubject)?requestedSubject:'Toán');
}

function chart(id){charts[id]??=echarts.init($(id));return charts[id]}
function subjectSuspects(){return D.suspects.filter(row=>row.subject===selectedSubject&&row.scale===selectedScale).sort((a,b)=>a.suspect_rank-b.suspect_rank)}
function subjectPeers(){return D.peers.filter(row=>row.subject===selectedSubject&&row.scale===selectedScale).sort((a,b)=>D.meta.peer_regions.indexOf(a.province)-D.meta.peer_regions.indexOf(b.province))}
function points(groupId){return pointsByGroup.get(groupId)||[]}

function selectSubject(subject){
  selectedSubject=subject;
  document.querySelectorAll('[data-subject]').forEach(button=>button.classList.toggle('active',button.dataset.subject===subject));
  const rows=subjectSuspects();
  selectedSuspect=rows[0]||null;
  renderList();
  render();
}

function selectScale(scale){
  selectedScale=scale;
  document.querySelectorAll('[data-scale]').forEach(button=>button.classList.toggle('active',button.dataset.scale===scale));
  const rows=subjectSuspects();
  selectedSuspect=rows[0]||null;
  renderList();
  render();
}

function selectSuspect(id){
  selectedSuspect=D.suspects.find(row=>row.suspect_id===id);
  renderList();
  render();
}

function renderList(){
  const rows=subjectSuspects();
  $('listTitle').textContent=selectedScale==='room'?`${rows.length} phòng ${selectedSubject} · 24 bài`:`Toàn bộ dãy ${selectedSubject} · ${rows[0]?.window_size||0} bài có điểm`;
  $('suspectList').innerHTML=rows.map(row=>`<button class="suspect-card ${selectedSuspect?.suspect_id===row.suspect_id?'active':''}" data-suspect="${row.suspect_id}"><code>${row.start_sbd}–${row.end_sbd}</code><div><span>Mean<strong>${nf.format(row.mean_score)}</strong></span><span>Điểm 10<strong>${row.count_10}</strong></span><span>≥9<strong>${row.count_ge9}</strong></span><span>≥8,5<strong>${row.count_ge8_5}</strong></span></div></button>`).join('');
  document.querySelectorAll('[data-suspect]').forEach(button=>button.addEventListener('click',()=>selectSuspect(button.dataset.suspect)));
}

function render(){
  const suspect=selectedSuspect;if(!suspect)return;
  const peers=subjectPeers(),groups=[{...suspect,group_id:suspect.suspect_id,province:'Tuyên Quang'},...peers];
  renderDetail(suspect);
  renderAnalytics(suspect,peers);
  renderCards(groups);
  renderComparisonSequences(groups);
  renderThreshold(groups);
  renderDistribution(groups);
  renderTable(suspect,groups);
}

function renderDetail(row){
  $('detailKicker').textContent=row.scale==='all'?`${row.subject} · toàn bộ ${D.meta.cohort_size} thí sinh · ${row.window_size} bài có điểm`:`${row.subject} · phòng giả định #${row.suspect_rank} · 24 bài`;
  $('detailTitle').textContent=`${row.start_sbd}—${row.end_sbd}`;
  $('detailNarrative').innerHTML=`Dãy này có điểm trung bình <strong>${nf.format(row.mean_score)}</strong>; ${row.count_ge8_5}/${row.window_size} bài từ 8,5 trở lên và ${row.count_10} điểm 10. Anomaly percentile: <strong>${nf.format(row.anomaly_percentile*100)}%</strong>.`;
  const kpis=[['Điểm trung bình',nf.format(row.mean_score)],['Điểm 10',`${row.count_10}/${row.window_size}`],['Từ 9 trở lên',`${row.count_ge9}/${row.window_size}`],['Từ 8,5 trở lên',`${row.count_ge8_5}/${row.window_size}`]];
  $('kpis').innerHTML=kpis.map(([label,value])=>`<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('scoreTitle').textContent=`${row.window_size} điểm ${row.subject} theo thứ tự SBD`;
  $('sequenceTitle').textContent=`Chuỗi ${row.window_size} điểm ${row.subject} đặt cạnh nhau`;
  $('scoreGrid').innerHTML=points(row.suspect_id).map(point=>`<div class="score-cell ${scoreClass(point.score)}"><span>${nf.format(point.score)}</span><small>${point.SBD.slice(-5)}</small></div>`).join('');
}

function longestRun(values,predicate){
  let best=0,current=0;
  values.forEach(value=>{current=predicate(Number(value))?current+1:0;best=Math.max(best,current)});
  return best;
}

function renderAnalytics(suspect,peers){
  const ordered=[...points(suspect.suspect_id)].sort((a,b)=>String(a.SBD).localeCompare(String(b.SBD)));
  const peerMaxMean=Math.max(...peers.map(row=>Number(row.mean_score)));
  const peerMaxGe9=Math.max(...peers.map(row=>Number(row.density_ge9)));
  const peerMaxGe95=Math.max(...peers.map(row=>Number(row.density_ge9_5)));
  const delta=suspect.mean_score-peerMaxMean;
  const run9=longestRun(ordered.map(row=>row.score),score=>score>=9);
  const ratio9=peerMaxGe9>0?suspect.density_ge9/peerMaxGe9:null;
  const ratio95=peerMaxGe95>0?suspect.density_ge9_5/peerMaxGe95:null;
  const fullyContained=suspect.start_sbd>=D.meta.cluster_start_sbd&&suspect.end_sbd<=D.meta.cluster_end_sbd;
  const peerWins=peers.filter(peer=>suspect.mean_score>peer.mean_score).length;
  const tailWins=peers.filter(peer=>suspect.density_ge9>peer.density_ge9).length;
  let verdict='Bằng chứng hỗn hợp';
  let verdictText=`Mean Tuyên Quang cao hơn ${peerWins}/${peers.length} dãy đối chứng, nhưng mật độ ≥9 chỉ cao hơn ${tailWins}/${peers.length} dãy.`;
  if(peerWins===peers.length&&tailWins===peers.length){verdict='Khác biệt mạnh so với đối chứng';verdictText='Tuyên Quang đồng thời cao hơn cả bốn dãy đối chứng về mean và mật độ điểm ≥9.'}
  else if(peerWins===0&&tailWins===0){verdict='Không nổi trội so với đối chứng';verdictText='Cả mean và mật độ ≥9 đều không vượt dãy đặc biệt của bốn tỉnh đối chứng.'}
  else if(peerWins>=3&&tailWins>=3){verdict='Khác biệt đáng chú ý';verdictText=`Tuyên Quang vượt ${peerWins}/4 dãy về mean và ${tailWins}/4 dãy về mật độ ≥9.`}
  $('focusBadge').textContent=fullyContained?`Nằm trọn ${D.meta.cluster_start_sbd}–${D.meta.cluster_end_sbd}`:'Cảnh báo: vượt vùng focus';
  $('focusBadge').classList.toggle('invalid',!fullyContained);
  const findings=[
    suspect.anomaly_percentile==null?`<strong>Phạm vi cohort:</strong> có <b>${D.meta.cohort_size} SBD</b> trong vùng; ${suspect.window_size} thí sinh có điểm ${suspect.subject}. Không gán percentile cửa sổ cho cohort toàn phần.`:`<strong>Vị trí cực trị:</strong> percentile anomaly <b>${nf.format(suspect.anomaly_percentile*100)}%</b> trong các cửa sổ ${suspect.subject} W${suspect.window_size} của Tuyên Quang.`,
    `<strong>Chênh lệch đối chứng bảo thủ:</strong> mean <b>${nf.format(suspect.mean_score)}</b>, ${delta>=0?'cao hơn':'thấp hơn'} cụm cao nhất trong 4 tỉnh đối chứng <b>${nf.format(Math.abs(delta))} điểm</b> (mốc ${nf.format(peerMaxMean)}).`,
    `<strong>Mật độ đuôi cao:</strong> ${suspect.count_ge9}/${suspect.window_size} bài ≥9 (${nf.format(suspect.density_ge9*100)}%)${ratio9!==null?`, bằng <b>${nf.format(ratio9)}×</b> mức cao nhất của đối chứng`:''}; ${suspect.count_ge9_5} bài ≥9,5${ratio95!==null?` (<b>${nf.format(ratio95)}×</b> đối chứng)`:''}.`,
    `<strong>Tính liền dãy:</strong> chuỗi dài nhất có điểm ≥9 gồm <b>${run9} bài liên tiếp theo thứ tự SBD có điểm</b>. Cần đối chiếu danh sách phòng thi để xác định các SBD này có cùng phòng hay không.`
  ];
  $('analyticsFindings').innerHTML=findings.map((text,index)=>`<article><span>0${index+1}</span><p>${text}</p></article>`).join('');
  $('analyticsTitle').textContent=`${verdict}: ${verdictText}`;
  $('peerReviews').innerHTML=peers.map(peer=>{
    const meanDelta=suspect.mean_score-peer.mean_score;
    const ge9Delta=(suspect.density_ge9-peer.density_ge9)*100;
    const relation=meanDelta>0&&ge9Delta>0?'Tuyên Quang cao hơn cả mean và đuôi ≥9':meanDelta<0&&ge9Delta<0?'Dãy đối chứng mạnh hơn cả mean và đuôi ≥9':'Hai chỉ số cho tín hiệu trái chiều';
    return `<article class="peer-review"><div class="peer-review-title"><strong>${escapeHtml(peer.province)}</strong><span>${relation}</span></div><code>${peer.start_sbd}–${peer.end_sbd}</code><dl><div><dt>Mean</dt><dd>${nf.format(peer.mean_score)}</dd></div><div><dt>≥9</dt><dd>${peer.count_ge9}/${peer.window_size}</dd></div><div><dt>≥9,5</dt><dd>${peer.count_ge9_5}/${peer.window_size}</dd></div><div><dt>Điểm 10</dt><dd>${peer.count_10}</dd></div></dl><p>So với Tuyên Quang: mean <b>${meanDelta>=0?'+':''}${nf.format(meanDelta)}</b>; tỷ lệ ≥9 <b>${ge9Delta>=0?'+':''}${nf.format(ge9Delta)} điểm %</b>.</p></article>`;
  }).join('');
}

function renderCards(groups){
  $('comparisonCards').innerHTML=groups.map((group,index)=>`<article class="compare-card ${index===0?'primary':''}"><span>${escapeHtml(group.province)} ${index===0?'· dãy đang soi':'· cụm cao nhất'}</span><code>${group.start_sbd}–${group.end_sbd}</code><strong>Mean ${nf.format(group.mean_score)}</strong><small>10: ${group.count_10} · ≥9: ${group.count_ge9} · ≥8,5: ${group.count_ge8_5}</small></article>`).join('');
}

function renderComparisonSequences(groups){
  $('comparisonScoreRows').innerHTML=groups.map(group=>{
    const groupPoints=[...points(group.group_id)].sort((a,b)=>String(a.SBD).localeCompare(String(b.SBD)));
    return `<div class="comparison-score-row"><div class="sequence-label"><strong>${escapeHtml(group.province)}</strong><code>${group.start_sbd}–${group.end_sbd}</code></div><div class="sequence-scroll"><div class="sequence-cells" style="grid-template-columns:repeat(${group.window_size},30px);width:max-content">${groupPoints.map(point=>`<div class="sequence-cell ${scoreClass(point.score)}" title="${point.SBD}: ${nf.format(point.score)}">${nf.format(point.score)}</div>`).join('')}</div></div></div>`;
  }).join('');
}

function renderThreshold(groups){
  const maxN=Math.max(...groups.map(group=>group.window_size));
  chart('thresholdChart').setOption({grid:{left:50,right:20,top:55,bottom:70},tooltip:{trigger:'axis'},legend:{top:0},xAxis:{type:'category',data:groups.map(group=>group.province),axisLabel:{rotate:22}},yAxis:{type:'value',min:0,max:maxN,name:'số bài'},series:[['≥8,5','count_ge8_5','#d38513'],['≥9','count_ge9','#dc2626'],['Điểm 10','count_10','#171c24']].map(([name,key,color])=>({name,type:'bar',data:groups.map(group=>group[key]),itemStyle:{color},label:{show:true,position:'top'}}))});
}

function distribution(pointsList){
  const counts=[0,0,0,0,0];
  pointsList.forEach(point=>{const value=Number(point.score);if(value===10)counts[4]++;else if(value>=9.5)counts[3]++;else if(value>=9)counts[2]++;else if(value>=8.5)counts[1]++;else counts[0]++});
  return counts;
}

function renderDistribution(groups){
  const maxN=Math.max(...groups.map(group=>group.window_size));
  $('distributionTitle').textContent=`Phân phối ${groups[0].window_size} điểm`;
  chart('distributionChart').setOption({grid:{left:50,right:20,top:65,bottom:45},tooltip:{trigger:'axis'},legend:{top:0,type:'scroll'},xAxis:{type:'category',data:['<8,5','8,5–8,99','9–9,49','9,5–9,99','10']},yAxis:{type:'value',min:0,max:maxN,name:'số bài'},series:groups.map(group=>({name:group.province,type:'bar',data:distribution(points(group.group_id)),itemStyle:{color:colors[group.province]}}))});
}

function renderTable(suspect,groups){
  $('comparisonTable').innerHTML=groups.map((group,index)=>`<tr><td><strong>${escapeHtml(group.province)}</strong></td><td><code>${group.start_sbd}–${group.end_sbd}</code></td><td>${nf.format(group.mean_score)}</td><td>${group.count_10}/${group.window_size}</td><td>${group.count_ge9}/${group.window_size}</td><td>${group.count_ge8_5}/${group.window_size}</td><td>${nf.format(group.std_score)}</td><td>${index===0?'—':`${group.mean_score-suspect.mean_score>=0?'+':''}${nf.format(group.mean_score-suspect.mean_score)}`}</td></tr>`).join('');
}

function scoreClass(value){return value===10?'ten':value>=9.5?'very-high':value>=8.5?'high':''}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
init();
