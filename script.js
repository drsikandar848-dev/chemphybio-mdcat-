/*
  CHEMPHYBIO MDCAT — beginner-friendly content file.
  To edit quiz questions or updates, change the sample data below.
  This website is a static demo: quiz scores are calculated in the browser.
*/
const quizData = {
  Biology: [
    {q:"Which organelle is known as the powerhouse of the cell?",o:["Nucleus","Mitochondrion","Ribosome","Golgi apparatus"],a:1,e:"Mitochondria produce most of the usable energy (ATP) in many eukaryotic cells."},
    {q:"What is the basic structural and functional unit of life?",o:["Tissue","Organ","Cell","Organ system"],a:2,e:"The cell is the basic structural and functional unit of living organisms."},
    {q:"Which molecule carries hereditary information in most organisms?",o:["DNA","Glucose","ATP","Cellulose"],a:0,e:"DNA stores hereditary information in most organisms."}
  ],
  Chemistry: [
    {q:"What is the chemical symbol for sodium?",o:["So","S","Na","N"],a:2,e:"Na is the chemical symbol for sodium, from the Latin name natrium."},
    {q:"A solution with pH 3 is best described as:",o:["Acidic","Neutral","Basic","Always pure water"],a:0,e:"A pH below 7 is acidic at the usual reference conditions."},
    {q:"Which subatomic particle has a negative charge?",o:["Proton","Neutron","Electron","Nucleus"],a:2,e:"Electrons carry a negative electric charge."}
  ],
  Physics: [
    {q:"What is the SI unit of force?",o:["Joule","Newton","Watt","Pascal"],a:1,e:"Force is measured in newtons (N) in the SI system."},
    {q:"Which quantity is equal to distance travelled per unit time?",o:["Acceleration","Velocity","Speed","Momentum"],a:2,e:"Speed is distance travelled per unit time."},
    {q:"Which type of lens is thicker at the centre than at the edges?",o:["Concave","Convex","Plane glass","Cylindrical only"],a:1,e:"A convex lens is generally thicker at its centre than at its edges."}
  ],
  English: [
    {q:"Choose the correctly spelled word:",o:["Accomodation","Accommodation","Acommodation","Accommadation"],a:1,e:"The correct spelling is accommodation, with double c and double m."},
    {q:"Choose the synonym of “rapid”:",o:["Slow","Quick","Dull","Weak"],a:1,e:"Rapid means fast or quick."},
    {q:"Choose the correct sentence:",o:["She go to school.","She going to school.","She goes to school.","She gone to school."],a:2,e:"With “she” in the simple present tense, the verb takes -s: goes."}
  ],
  "Logical Reasoning": [
    {q:"What number comes next: 2, 4, 8, 16, …?",o:["18","24","30","32"],a:3,e:"Each term is doubled, so 16 × 2 = 32."},
    {q:"If all roses are flowers, which statement must be true?",o:["All flowers are roses","Every rose is a flower","No rose is a flower","All plants are roses"],a:1,e:"This restates the given relationship without reversing it."},
    {q:"Find the odd one out:",o:["Triangle","Square","Circle","Blue"],a:3,e:"Blue is a colour; the others are geometric shapes."}
  ]
};

const updates = [
  {day:"INFO",month:"NOTE",title:"Check official MDCAT announcements",text:"For current registration dates, syllabus and policy changes, check the relevant official admitting university or authority website."},
  {day:"STUDY",month:"TIP",title:"Build a consistent revision routine",text:"Practise a small set of MCQs daily, review explanations and keep a list of concepts that need more attention."},
  {day:"VERIFY",month:"ALERT",title:"Beware of unverified notices",text:"Do not rely on forwarded messages for exam dates, fees or eligibility. Confirm important information from official sources."}
];

let currentSubject = "Biology";
let questionIndex = 0;
let score = 0;
let answered = false;
let language = "en";

const $ = id => document.getElementById(id);
const subjectSelect = $("subjectSelect");

function renderQuestion(){
  const list = quizData[currentSubject];
  const item = list[questionIndex];
  answered = false;
  $("quizTitle").textContent = currentSubject + " Quick Quiz";
  $("questionCount").textContent = `Question ${questionIndex+1} of ${list.length}`;
  $("progressPercent").textContent = `${Math.round((questionIndex+1)/list.length*100)}%`;
  $("progressBar").style.width = `${(questionIndex+1)/list.length*100}%`;
  $("questionText").textContent = item.q;
  $("scoreText").textContent = `Score: ${score}`;
  $("feedback").textContent = "";
  $("nextQuestion").disabled = true;
  $("nextQuestion").textContent = questionIndex === list.length-1 ? "See result →" : "Next question →";
  $("options").innerHTML = "";
  item.o.forEach((option,index)=>{
    const button = document.createElement("button");
    button.className = "option";
    button.type = "button";
    button.textContent = `${String.fromCharCode(65+index)}. ${option}`;
    button.addEventListener("click",()=>selectAnswer(index));
    $("options").appendChild(button);
  });
  $("quizArea").classList.remove("hidden");
  $("quizResult").classList.add("hidden");
}
function selectAnswer(index){
  if(answered) return;
  answered = true;
  const item = quizData[currentSubject][questionIndex];
  const buttons = [...$("options").children];
  buttons.forEach((button,i)=>{
    button.disabled = true;
    if(i===item.a) button.classList.add("correct");
    else if(i===index) button.classList.add("wrong");
  });
  if(index===item.a){score++;$("feedback").textContent = "✓ Correct! " + item.e;}
  else {$("feedback").textContent = "Not quite. " + item.e;}
  $("scoreText").textContent = `Score: ${score}`;
  $("nextQuestion").disabled = false;
}
function nextQuestion(){
  if(!answered) return;
  if(questionIndex < quizData[currentSubject].length-1){questionIndex++;renderQuestion();}
  else{
    $("quizArea").classList.add("hidden");
    $("quizResult").classList.remove("hidden");
    const total=quizData[currentSubject].length;
    const percent=Math.round(score/total*100);
    $("quizResult").innerHTML=`<div style="font-size:38px">🎓</div><h3>Quiz completed!</h3><strong>${score}/${total}</strong><p>You scored ${percent}%. Keep practising and reviewing your answers.</p><button class="btn btn-primary" id="retryQuiz">Try again</button>`;
    $("retryQuiz").addEventListener("click",resetQuiz);
  }
}
function resetQuiz(){
  questionIndex=0;score=0;renderQuestion();
}
function changeSubject(subject){
  currentSubject=subject;
  subjectSelect.value=subject;
  resetQuiz();
  $("quiz").scrollIntoView({behavior:"smooth"});
}
subjectSelect.addEventListener("change",e=>changeSubject(e.target.value));
$("nextQuestion").addEventListener("click",nextQuestion);
document.querySelectorAll(".subject-quiz").forEach(button=>button.addEventListener("click",()=>changeSubject(button.dataset.subject)));

function renderUpdates(){
  $("updatesList").innerHTML="";
  updates.forEach(item=>{
    const card=document.createElement("article");
    card.className="update-card";
    const date=document.createElement("div");date.className="update-date";
    const strong=document.createElement("strong");strong.textContent=item.day;
    const small=document.createElement("span");small.textContent=item.month;
    date.append(strong,small);
    const body=document.createElement("div");
    const title=document.createElement("h3");title.textContent=item.title;
    const text=document.createElement("p");text.textContent=item.text;
    body.append(title,text);card.append(date,body);$("updatesList").append(card);
  });
}
function setLanguage(next){
  language=next;
  document.body.classList.toggle("urdu",language==="ur");
  document.documentElement.lang=language==="ur"?"ur":"en";
  document.querySelectorAll("[data-en]").forEach(el=>{
    el.innerHTML=language==="ur"?el.dataset.ur:el.dataset.en;
  });
  $("languageToggle").textContent=language==="ur"?"English":"اردو";
}
$("languageToggle").addEventListener("click",()=>setLanguage(language==="en"?"ur":"en"));
$("menuToggle").addEventListener("click",()=>$("mainNav").classList.toggle("open"));
document.querySelectorAll("#mainNav a").forEach(a=>a.addEventListener("click",()=>$("mainNav").classList.remove("open")));
$("year").textContent=new Date().getFullYear();
renderUpdates();
renderQuestion();
