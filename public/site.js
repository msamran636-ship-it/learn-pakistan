const cats=["Latest News","Pakistan","World","Education","Technology","Business","Sports","Entertainment","Knowledge","Opinion"];
let lang=localStorage.getItem("lp_lang")||"en";
document.getElementById("nav").innerHTML=cats.map(c=>`<a href="?category=${encodeURIComponent(c)}">${c}</a>`).join("");
async function load(){
 const p=new URLSearchParams(location.search); const category=p.get("category"); const q=document.getElementById("q").value;
 const r=await fetch("/api/articles?"+new URLSearchParams({category:category||"",q:q||"",limit:50})); const data=await r.json();
 const hero=data.find(a=>a.featured)||data[0];
 document.getElementById("hero").innerHTML=hero?`<div><span class="tag">${hero.category}</span><h1>${lang==="ur"?(hero.title_ur||hero.title_en):hero.title_en}</h1><p>${lang==="ur"?(hero.excerpt_ur||hero.excerpt_en):hero.excerpt_en}</p><small>${new Date(hero.published_at||hero.created_at).toLocaleDateString()}</small></div>`:"<div><h1>No articles yet</h1></div>";
 document.getElementById("articles").innerHTML=data.map(a=>`<article class="card"><div class="card-img">${a.image_url?`<img src="${a.image_url}" style="width:100%;height:100%;object-fit:cover">`:a.category}</div><div class="card-body"><span class="tag">${a.category}</span><h3><a href="/article.html?slug=${encodeURIComponent(a.slug)}">${lang==="ur"?(a.title_ur||a.title_en):a.title_en}</a></h3><p class="muted">${lang==="ur"?(a.excerpt_ur||a.excerpt_en):a.excerpt_en}</p></div></article>`).join("");
 document.getElementById("cats").innerHTML=cats.slice(1).map(c=>`<div class="cat"><a href="?category=${encodeURIComponent(c)}">${c}</a></div>`).join("");
 document.getElementById("trend").innerHTML=data.slice(0,5).map((a,i)=>`<div class="trend">${i+1}. ${lang==="ur"?(a.title_ur||a.title_en):a.title_en}</div>`).join("");
}
document.getElementById("q").addEventListener("keydown",e=>{if(e.key==="Enter")load()}); load();