/** Port of the user-selected Claude → DeepSeek v5 prototype. Source SHA-256: 1ef10ac1819d0f03dcb409cf547a951a38b96316108fc5b527c4ac2d6cc0efcf.
 * Queries, styles, timers and observers stay scoped to this marketing surface.
 * The walkthrough uses fictional data only; no account or model API is called.
 */
export function mountFirstLight(root) {
  let disposed = false;
  const timers = new Set();
  const frames = new Set();
  const observers = [];
  const controller = new AbortController();
  let toastTimer;
  function byId(id) {
    return root.querySelector("#" + CSS.escape(id));
  }
  function setTimeout(callback, ms) {
    if (disposed) return 0;
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, ms);
    timers.add(id);
    return id;
  }
  function clearTimeout(id) {
    window.clearTimeout(id);
    timers.delete(id);
  }
  function requestAnimationFrame(callback) {
    if (disposed) return 0;
    const id = window.requestAnimationFrame((t) => {
      frames.delete(id);
      if (!disposed) callback(t);
    });
    frames.add(id);
    return id;
  }
  function addEventListener(name, callback, options) {
    window.addEventListener(name, callback, {
      ...options,
      signal: controller.signal,
    });
  }
  function observe(callback, options) {
    const observer = new IntersectionObserver((entries, self) => {
      if (!disposed) callback(entries, self);
    }, options);
    observers.push(observer);
    return observer;
  }

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(devicePixelRatio || 1, 2);
  function $(s) {
    return root.querySelector(s);
  }

  /* ---------- data ---------- */
  var VOICES = [
    "回国三个月了，国内秋招一个批次都没赶上。",
    "生物硕士，导师让我读博，我真的不想。",
    "投了 60 份，3 个笔试，0 个面试。",
    "在小公司做了两年运营，简历写不出亮点。",
    "考公没上岸，现在才开始找工作。",
    "手上两个 offer，不知道该选哪个。",
    "每次都挂在二面，不知道问题在哪。",
    "二本，不知道自己能投什么。",
    "工作一年，想转 AI 产品，又怕来不及。",
    "明天就面试了，自我介绍还没准备。",
    "学材料的，身边同学都转码了，我要不要跟？",
    "实习经历很水，写出来自己都心虚。",
    "家里希望我考编，我想去互联网。",
    "每天刷招聘软件，刷完更焦虑了。",
  ];
  var PLANS = [
    {
      k: /读博|博士|生物|化学|材料|环境|实验|天坑|转码/,
      note: "我听到了：你想直接工作，不想再等五年。我们先看看，你的实验经历能投哪些岗位。",
      tasks: [
        [
          "找 3 个招理科背景的岗位，看它们要什么",
          "研发助理、数据分析、医药注册都在招",
          "15 分",
        ],
        [
          "把最熟的一次实验写成 3 句话",
          "问题 / 你做了什么 / 结果——面试就讲这个",
          "10 分",
        ],
        ["写下想去的城市和能接受的最低月薪", "先定边界，投得才快", "5 分"],
      ],
    },
    {
      k: /回国|留学|海归|秋招|批次/,
      note: "我听到了：不是你不够好，是节奏错开了。先找到还开着的门。",
      tasks: [
        ["列出还在开放的 3 个招聘批次", "只看不投，先摸清节奏", "15 分"],
        [
          "把海外那段经历翻成国内 HR 看得懂的一句话",
          "少写课程名，多写你做成了什么",
          "10 分",
        ],
        [
          "问一个已经回国工作的同学：第一年在做什么",
          "真实的一句话，比十篇攻略有用",
          "5 分",
        ],
      ],
    },
    {
      k: /投了|没回音|面试|二面|笔试|简历|亮点|心虚|水/,
      note: "我听到了：你一直在用力，但不知道力用在了哪儿。我们先找出卡住的那一环。",
      tasks: [
        [
          "挑 1 个最想去的岗位，对着要求逐条打勾",
          "缺的那条，就是这周要补的",
          "15 分",
        ],
        [
          "把最心虚的那段经历讲给我听",
          "讲不清的地方，正是面试官会追问的",
          "10 分",
        ],
        ["写下最近一次面试被问倒的那道题", "原样记下来，明天一起拆", "5 分"],
      ],
    },
    {
      k: /offer|选哪个|两个/,
      note: "我听到了：两个都不差，所以才难选。我们先把你最在意的写下来。",
      tasks: [
        [
          "写下你最在意的 3 件事，排个序",
          "钱、成长、城市、人……没有标准答案",
          "10 分",
        ],
        ["把两个 offer 的同一项放在一起比", "只比你排在前面的那几项", "15 分"],
        [
          "问自己：一年后想在简历上多一行什么",
          "这一行，比月薪差的那几百块重要",
          "5 分",
        ],
      ],
    },
    {
      k: /考公|考编|家里|上岸|二本|焦虑|刷|来不及|转|AI/,
      note: "我听到了：你心里其实有答案，只是还不敢说出来。我们先从最小的一步试试。",
      tasks: [
        [
          "写下你最想去的那个方向，一句话就行",
          "不用告诉别人，先告诉自己",
          "5 分",
        ],
        [
          "找 2 个这个方向的真实岗位，看要求",
          "看看它离你，比想象中远还是近",
          "10 分",
        ],
        ["列出你已经会的 3 件事", "它们比你以为的更有用", "10 分"],
      ],
    },
  ];
  var DEFAULT = {
    note: "",
    tasks: [
      [
        "把「客服知识助手」那段改成 3 句话，带上一个数字",
        "HR 扫简历只看几秒，数字最先被看见",
        "15 分",
      ],
      [
        "对照想投的岗位，圈出你还缺的那一条",
        "缺的那条，就是这周要补的",
        "10 分",
      ],
      [
        "准备一道面试题：讲一次你搞砸又补回来的事",
        "几乎每场面试都会问",
        "10 分",
      ],
    ],
  };
  var DONE_LINES = [
    "好，这件算数。",
    "又近了一点。",
    "今天的做完了。去吃点好的，明天见。",
  ];

  /* ---------- mentor ---------- */
  var mstate = $("#mstate");
  function mentor(s, label) {
    root.querySelectorAll("#mentor img").forEach(function (i) {
      i.classList.toggle("on", i.dataset.s === s);
    });
    if (label) mstate.innerHTML = "<i></i>" + label;
  }

  /* ---------- today list ---------- */
  var list = $("#list"),
    done = 0;
  function renderTasks(tasks, animate) {
    list.innerHTML = "";
    done = 0;
    tasks.forEach(function (t, i) {
      var li = document.createElement("li");
      li.className = "item" + (animate ? " enter" : "");
      li.style.animationDelay = i * 0.12 + "s";
      li.innerHTML =
        '<button class="check" aria-label="完成：' +
        t[0] +
        '"></button><span class="t">' +
        t[0] +
        '<span class="why">' +
        t[1] +
        '</span></span><span class="min">' +
        t[2] +
        "</span>";
      li.querySelector(".check").addEventListener("click", function () {
        finish(li);
      });
      list.appendChild(li);
    });
  }
  renderTasks(DEFAULT.tasks, false);
  var dots = $("#dots"),
    lit = 4;
  for (var i = 0; i < 12; i++) {
    var d = document.createElement("i");
    if (i < lit) d.className = "lit";
    dots.appendChild(d);
  }
  var h = new Date().getHours();
  var greet =
    h < 5
      ? "这么晚还没睡？先休息，明天我们只做一件。"
      : h < 11
        ? "早上好。"
        : h < 14
          ? "中午好。"
          : h < 18
            ? "下午好。"
            : "晚上好。";
  var seen = null;
  try {
    seen = sessionStorage.getItem("yi-zhi:home-demo-seen");
    sessionStorage.setItem("yi-zhi:home-demo-seen", String(Date.now()));
  } catch {}
  if (seen)
    $("#noteText").textContent =
      "示例：又见面了。我们接着把简历最弱的那段补上。";
  else if (h >= 5)
    $("#noteText").textContent =
      greet +
      "昨天你投了 3 个 AI 产品岗——今天我们把简历里最弱的那段补上，下午就能再投。";
  mentor("wave", "在呢");
  setTimeout(
    function () {
      mentor("point", "今天的三件，在这儿");
    },
    reduce ? 0 : 4200,
  );

  function setNote(text) {
    var el = $("#noteText");
    el.textContent = "";
    var k = 0;
    (function type() {
      el.textContent = text.slice(0, ++k);
      if (k < text.length) setTimeout(type, reduce ? 0 : 38);
    })();
    $("#noteTime").textContent = "刚刚";
  }

  /* ---------- hear: input -> mentor responds, plan rewrites ---------- */
  function hear(v) {
    v = (v || "").trim();
    if (v.length < 2) {
      $("#q").focus();
      return;
    }
    mentor("thinking", "在想…");
    $("#today").scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
    setTimeout(
      function () {
        mentor("reading", "在看你说的…");
        var p = PLANS.find(function (x) {
          return x.k.test(v);
        }) || {
          note:
            "我听到了：「" +
            v.slice(0, 20) +
            (v.length > 20 ? "…" : "") +
            "」。再多跟我说一点——你学什么、做过什么、最不想做什么？",
          tasks: [
            ["用三句话写下：我学了什么", "不用好看，写真的", "5 分"],
            ["写下一件做成过、有点骄傲的事", "哪怕很小", "10 分"],
            ["写下你最不想再做的一种工作", "知道不要什么，也是方向", "5 分"],
          ],
        };
        setTimeout(
          function () {
            setNote(p.note);
            renderTasks(p.tasks, true);
            $("#dayTag").textContent = "第 1 天 · 示例";
            mentor("point", "今天先做这些");
          },
          reduce ? 0 : 900,
        );
      },
      reduce ? 0 : 900,
    );
  }
  var typing;
  $("#q").addEventListener("input", function () {
    mentor("thinking", "在听…");
    clearTimeout(typing);
    typing = setTimeout(function () {
      mentor("wave", "说完了就点「跟我说说」");
    }, 1600);
  });

  /* ---------- voices marquee ---------- */
  function fillRow(el, arr) {
    arr.concat(arr).forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "voice";
      b.textContent = t;
      b.addEventListener("click", function () {
        flyTo(b, t);
      });
      el.appendChild(b);
    });
  }
  fillRow($("#row1"), VOICES.slice(0, 7));
  fillRow($("#row2"), VOICES.slice(7));

  /* ---------- fx canvas (dust, fly) ---------- */
  var fx = $("#fx"),
    fc = fx.getContext("2d"),
    P = [],
    running = false;
  function sizeFx() {
    fx.width = innerWidth * DPR;
    fx.height = innerHeight * DPR;
    fx.style.width = innerWidth + "px";
    fx.style.height = innerHeight + "px";
  }
  sizeFx();
  addEventListener("resize", sizeFx);
  function run() {
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }
  function loop() {
    fc.setTransform(DPR, 0, 0, DPR, 0, 0);
    fc.clearRect(0, 0, innerWidth, innerHeight);
    P = P.filter(function (p) {
      return p.step(fc);
    });
    if (P.length) requestAnimationFrame(loop);
    else running = false;
  }
  function sample(drawFn, w, h, step) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var x = c.getContext("2d");
    drawFn(x);
    var d = x.getImageData(0, 0, w, h).data,
      out = [];
    for (var yy = 0; yy < h; yy += step)
      for (var xx = 0; xx < w; xx += step) {
        var i = (yy * w + xx) * 4;
        if (d[i + 3] > 40)
          out.push([xx, yy, d[i], d[i + 1], d[i + 2], d[i + 3] / 255]);
      }
    return out;
  }
  /* voice -> particles fly into the input */
  function flyTo(btn, text) {
    var r = btn.getBoundingClientRect(),
      q = $("#q"),
      tr = q.getBoundingClientRect();
    if (reduce) {
      q.value = text;
      hear(text);
      return;
    }
    var fs = getComputedStyle(btn);
    var pts = sample(
      function (x) {
        x.font = fs.fontSize + " " + fs.fontFamily;
        x.fillStyle = "#2A2620";
        x.textBaseline = "middle";
        x.fillText(text, parseFloat(fs.paddingLeft) + 12, r.height / 2);
      },
      Math.ceil(r.width),
      Math.ceil(r.height),
      2,
    );
    btn.style.opacity = 0.25;
    var tx = tr.left + 20,
      ty = tr.top + 20;
    pts.forEach(function (p) {
      var sx = r.left + p[0],
        sy = r.top + p[1],
        t = 0,
        dl = Math.random() * 14,
        cx = (sx + tx) / 2 + (Math.random() - 0.5) * 160,
        cy = Math.min(sy, ty) - 80 - Math.random() * 120,
        ex = tx + (p[0] / r.width) * Math.min(tr.width - 40, r.width),
        ey = ty + (Math.random() - 0.5) * 14;
      P.push({
        step: function (c) {
          if (dl > 0) {
            dl--;
            c.fillStyle = "rgba(42,38,32," + p[5] + ")";
            c.fillRect(sx, sy, 1.6, 1.6);
            return true;
          }
          t += 0.022;
          if (t > 1) return false;
          var e = 1 - Math.pow(1 - t, 3),
            u = 1 - e;
          var x = u * u * sx + 2 * u * e * cx + e * e * ex,
            y = u * u * sy + 2 * u * e * cy + e * e * ey;
          c.fillStyle =
            "rgba(" +
            (42 + 200 * Math.sin(t * 3.1)) +
            "," +
            (38 + 150 * Math.sin(t * 3.1)) +
            "," +
            (32 + 80 * Math.sin(t * 3.1)) +
            "," +
            (1 - t * 0.6) +
            ")";
          c.fillRect(x, y, 1.8, 1.8);
          return true;
        },
      });
    });
    run();
    setTimeout(
      function () {
        btn.style.opacity = "";
        q.value = text;
        q.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 400 });
        hear(text);
      },
      reduce ? 0 : 900,
    );
    $("#ask").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  /* task done -> dust rises into the light, a new light dot */
  function finish(li) {
    if (li.dataset.go) return;
    li.dataset.go = 1;
    mentor("reading", "在看…");
    var r = li.getBoundingClientRect();
    var tt = li.querySelector(".t"),
      ts = getComputedStyle(tt),
      tr = tt.getBoundingClientRect();
    var pts = reduce
      ? []
      : sample(
          function (x) {
            x.fillStyle = "rgba(255,253,248,.9)";
            x.fillRect(0, 0, r.width, r.height);
            x.fillStyle = "#2A2620";
            x.font = "600 " + ts.fontSize + " " + ts.fontFamily;
            x.textBaseline = "top";
            x.fillText(
              tt.firstChild.textContent,
              tr.left - r.left,
              tr.top - r.top + 2,
            );
            x.strokeStyle = "#E0552C";
            x.lineWidth = 2.5;
            var cb = li.querySelector(".check").getBoundingClientRect();
            x.beginPath();
            x.arc(
              cb.left - r.left + cb.width / 2,
              cb.top - r.top + cb.height / 2,
              cb.width / 2 - 1,
              0,
              7,
            );
            x.stroke();
          },
          Math.ceil(r.width),
          Math.ceil(r.height),
          3,
        );
    li.style.visibility = "hidden";
    var dd =
      dots.children[
        Math.min(lit, dots.children.length - 1)
      ].getBoundingClientRect();
    pts.forEach(function (p) {
      var x = r.left + p[0],
        y = r.top + p[1],
        vx = 0.6 + Math.random() * 1.6,
        vy = -0.4 - Math.random() * 1.4,
        dl = (p[0] / r.width) * 22 + Math.random() * 10,
        life = 0,
        gold = Math.random() < 0.35;
      P.push({
        step: function (c) {
          if (dl > 0) {
            dl--;
            c.fillStyle =
              "rgba(" + p[2] + "," + p[3] + "," + p[4] + "," + p[5] + ")";
            c.fillRect(x, y, 2.2, 2.2);
            return true;
          }
          life++;
          x += vx + Math.sin(life / 9) * 0.6;
          y += vy;
          vy -= 0.03;
          var a = 1 - life / 60;
          if (a <= 0) return false;
          c.fillStyle = gold
            ? "rgba(255,214,150," + a + ")"
            : "rgba(" + p[2] + "," + p[3] + "," + p[4] + "," + a * p[5] + ")";
          var s = gold ? 2.4 : 1.8;
          c.fillRect(x, y, s, s);
          return true;
        },
      });
    });
    /* a few motes travel to the light dots */
    if (!reduce)
      for (var k = 0; k < 14; k++)
        (function () {
          var sx = r.left + r.width * Math.random(),
            sy = r.top + r.height / 2,
            t = 0,
            dl = 10 + Math.random() * 20;
          P.push({
            step: function (c) {
              if (dl-- > 0) return true;
              t += 0.03;
              if (t > 1) return false;
              var e = t * t * (3 - 2 * t);
              var x = sx + (dd.left + 4 - sx) * e,
                y = sy + (dd.top + 4 - sy) * e - Math.sin(e * Math.PI) * 60;
              c.fillStyle = "rgba(255,200,120," + (1 - t * 0.3) + ")";
              c.beginPath();
              c.arc(x, y, 2, 0, 7);
              c.fill();
              return true;
            },
          });
        })();
    run();
    setTimeout(
      function () {
        li.classList.add("gone");
      },
      reduce ? 0 : 450,
    );
    setTimeout(
      function () {
        li.remove();
        done++;
        var d = dots.children[lit];
        if (d) {
          d.className = "lit new";
        }
        lit++;
        mentor("done", done >= 3 ? "今天的做完了" : "这件算数");
        toast(DONE_LINES[Math.min(done, 3) - 1]);
        if (done >= 3) {
          setNote("今天的三件都做完了。去吃点好的，明天见。");
        }
        setTimeout(function () {
          if (done < 3) mentor("point", "下一件");
        }, 2200);
      },
      reduce ? 0 : 1000,
    );
  }
  function toast(m) {
    var t = $("#toast");
    $("#toastText").textContent = m;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("on");
    }, 2600);
  }

  /* ---------- dust in the beam (hero) ---------- */
  var dc = $("#dustCanvas"),
    dx = dc.getContext("2d"),
    hero = $("#top"),
    motes = [],
    mouse = { x: -999, y: -999 };
  function sizeDust() {
    var r = hero.getBoundingClientRect();
    dc.width = r.width * DPR;
    dc.height = r.height * DPR;
    dc.style.width = r.width + "px";
    dc.style.height = r.height + "px";
  }
  sizeDust();
  addEventListener("resize", sizeDust);
  hero.addEventListener("pointermove", function (e) {
    var r = hero.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  hero.addEventListener("pointerleave", function () {
    mouse.x = mouse.y = -999;
  });
  function inBeam(x, y, W, H) {
    /* beam runs from top-right down to lower-left */ var t = (W - x) / W;
    var center = t * H * 0.95;
    return Math.abs(y - center) < H * (0.12 + 0.25 * t);
  }
  for (var m = 0; m < 140; m++) {
    motes.push({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.00008,
      vy: -(Math.random() * 0.00012 + 0.00002),
      ph: Math.random() * 7,
      ox: 0,
      oy: 0,
    });
  }
  function dust(t) {
    var W = dc.width / DPR,
      H = dc.height / DPR;
    dx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dx.clearRect(0, 0, W, H);
    motes.forEach(function (p) {
      p.x += p.vx + Math.sin(t / 5000 + p.ph) * 0.00005;
      p.y += p.vy;
      if (p.y < -0.02) p.y = 1.02;
      if (p.x < 0) p.x = 1;
      if (p.x > 1) p.x = 0;
      var x = p.x * W,
        y = p.y * H,
        ddx = x - mouse.x,
        ddy = y - mouse.y,
        dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist > 0 && dist < 110) {
        p.ox += (ddx / dist) * 1.4;
        p.oy += (ddy / dist) * 1.4;
      }
      p.ox *= 0.94;
      p.oy *= 0.94;
      x += p.ox;
      y += p.oy;
      var b = inBeam(x, y, W, H) ? 1 : 0.22,
        a = (0.35 + 0.45 * Math.sin(t / 800 + p.ph)) * b;
      if (a <= 0.02) return;
      dx.beginPath();
      dx.arc(x, y, p.r * (b > 0.5 ? 1.2 : 1), 0, 7);
      dx.fillStyle = "rgba(255,244,222," + a + ")";
      dx.shadowColor = "rgba(255,210,150,.9)";
      dx.shadowBlur = b > 0.5 ? 6 : 0;
      dx.fill();
    });
    if (!reduce) requestAnimationFrame(dust);
  }
  requestAnimationFrame(dust);

  /* ---------- headline assembles from dust ---------- */
  function assemble() {
    var h1 = $("#h1");
    if (reduce) {
      h1.classList.remove("assembling");
      return;
    }
    var lines = h1.querySelectorAll(".l"),
      pts = [];
    lines.forEach(function (l, li) {
      var r = l.getBoundingClientRect(),
        cs = getComputedStyle(l);
      var w = Math.ceil(r.width + 20),
        hh = Math.ceil(r.height);
      var s = sample(
        function (x) {
          x.font = cs.fontSize + " " + cs.fontFamily;
          x.textBaseline = "top";
          if (li === 1) {
            var g = x.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, "#C9562A");
            g.addColorStop(0.55, "#E07A3E");
            g.addColorStop(1, "#D99A57");
            x.fillStyle = g;
          } else x.fillStyle = "#2A2620";
          x.fillText(l.textContent, 0, (hh - parseFloat(cs.fontSize)) / 2 + 4);
        },
        w,
        hh,
        3,
      );
      s.forEach(function (p) {
        pts.push([r.left + p[0], r.top + p[1], p[2], p[3], p[4]]);
      });
    });
    var W = innerWidth,
      H = innerHeight;
    var T0 = performance.now();
    pts.forEach(function (p) {
      var sx = W * (0.55 + Math.random() * 0.45),
        sy = H * Math.random() * 0.6,
        dl = Math.random() * 450,
        dur = 1000 + Math.random() * 350;
      P.push({
        step: function (c) {
          var el = performance.now() - T0 - dl;
          if (el < 0) return true;
          var t = el / dur;
          if (t >= 1.3) return false;
          var e = t >= 1 ? 1 : 1 - Math.pow(1 - t, 4);
          var x = sx + (p[0] - sx) * e,
            y = sy + (p[1] - sy) * e;
          var a = t < 1 ? 0.9 : Math.max(0, 1 - (t - 1) * 3.4);
          c.fillStyle =
            "rgba(" + p[2] + "," + p[3] + "," + p[4] + "," + a + ")";
          c.fillRect(x, y, 2.2, 2.2);
          return true;
        },
      });
    });
    run();
    setTimeout(function () {
      h1.classList.remove("assembling");
    }, 1500);
  }
  (document.fonts && document.fonts.ready
    ? document.fonts.ready
    : Promise.resolve()
  ).then(function () {
    setTimeout(assemble, 250);
  });

  /* ---------- today card tilt ---------- */
  var today = $("#today");
  addEventListener("pointermove", function (e) {
    if (reduce || innerWidth < 1060) return;
    var r = today.getBoundingClientRect();
    var ax = (e.clientX - (r.left + r.width / 2)) / innerWidth,
      ay = (e.clientY - (r.top + r.height / 2)) / innerHeight;
    today.style.transform =
      "perspective(1200px) rotateY(" +
      ax * 6 +
      "deg) rotateX(" +
      -ay * 6 +
      "deg)";
  });

  /* ---------- light fields (Day 1/7/30) ---------- */
  function drawField(cv) {
    var w = cv.clientWidth,
      h = cv.clientHeight;
    cv.width = w * DPR;
    cv.height = h * DPR;
    var c = cv.getContext("2d");
    c.scale(DPR, DPR);
    var n = +cv.dataset.n,
      seed = n * 7;
    function rnd() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    var stars = [];
    for (var i = 0; i < n; i++)
      stars.push({
        x: w * (0.15 + 0.7 * rnd()),
        y: h * (0.15 + 0.7 * rnd()),
        r: 1 + rnd() * 2.2,
        ph: rnd() * 7,
      });
    (function frame(t) {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = "rgba(224,140,80,.18)";
      c.lineWidth = 1;
      for (var i = 1; i < stars.length; i++) {
        var a = stars[i],
          b = stars[i - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 70) {
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }
      stars.forEach(function (s) {
        var g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        var a = 0.6 + 0.4 * Math.sin((t || 0) / 900 + s.ph);
        g.addColorStop(0, "rgba(255,248,230," + a + ")");
        g.addColorStop(0.35, "rgba(244,180,100," + a * 0.7 + ")");
        g.addColorStop(1, "rgba(224,85,44,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(s.x, s.y, s.r * 5, 0, 7);
        c.fill();
      });
      if (!reduce) requestAnimationFrame(frame);
    })(0);
  }

  /* ---------- walk: one real product window, three annotated moments ---------- */
  var walk = $("#walk"),
    rail = $("#rail"),
    track = $("#track"),
    feed;
  var WS = { job: 0, resume: 0, interview: 0 },
    jobA = null,
    cvDone = false,
    curTab = "job";
  var TITLES = {
    job: "益职 · 作战盘 — AI 应用产品经理 · 岗位判断",
    resume: "益职 · 作战盘 — AI 应用产品经理 · 简历（一岗一版）",
    interview: "益职 · 作战盘 — AI 应用产品经理 · 模拟面试",
  };
  function railFeed() {
    if (!feed) {
      rail.insertAdjacentHTML(
        "afterbegin",
        '<div class="rail-h"><span>导师批注</span><span></span></div><div class="rail-feed"></div>',
      );
      feed = rail.querySelector(".rail-feed");
    }
    return feed;
  }
  function comment(html, opt) {
    opt = opt || {};
    if (!opt.keep)
      rail.querySelectorAll(".cm").forEach(function (c) {
        c.classList.add("old");
        c.classList.remove("cm-ask");
      });
    var d = document.createElement("div");
    d.className =
      "cm" +
      (opt.ask ? " cm-ask" : "") +
      (opt.saved ? " saved" : "") +
      (opt.seek ? " cm-seek" : "");
    d.innerHTML =
      '<div class="cm-who"><b>导师</b><span>· ' +
      (opt.when || "刚刚") +
      "</span></div>" +
      html;
    var f = railFeed();
    f.appendChild(d);
    var all = f.querySelectorAll(".cm");
    if (all.length > 4) all[0].remove();
    f.scrollTo({
      top: f.scrollHeight,
      behavior: typeof reduce !== "undefined" && reduce ? "auto" : "smooth",
    });
    return d;
  }
  function railHead(t) {
    var f = railFeed(),
      h = f.parentNode.querySelector(".rail-h span:last-child");
    if (h) h.textContent = t;
  }
  function setTab(t) {
    if (curTab === t) return;
    curTab = t;
    root.querySelectorAll(".pane").forEach(function (p) {
      p.classList.toggle("on", p.dataset.pane === t);
    });
    root.querySelectorAll(".side span").forEach(function (s) {
      s.classList.toggle("on", s.dataset.tab === t);
    });
    root.querySelectorAll(".bd").forEach(function (b) {
      b.classList.toggle("on", b.dataset.bd === t);
    });
    root.querySelectorAll("#chapters li").forEach(function (l) {
      l.classList.toggle("on", l.dataset.ch === t);
    });
    walk.classList.toggle("dusk", t === "interview");
    $("#winTitle").textContent = TITLES[t];
    railHead({ job: "看岗位", resume: "改简历", interview: "练面试" }[t]);
    rail.querySelectorAll(".cm").forEach(function (c) {
      c.classList.add("old");
      c.classList.remove("cm-ask");
    });
    setTimeout(fitShots, 60);
    if (typeof say === "function" && LINES[t]) say(t);
  }
  function chapterProgress(t, n, max) {
    var li = root.querySelector('#chapters li[data-ch="' + t + '"]');
    li.querySelector(".bar s").style.width = (n / max) * 100 + "%";
  }
  function markDone(t) {
    root
      .querySelector('#chapters li[data-ch="' + t + '"]')
      .classList.add("done");
  }
  function fitShots() {
    if (innerWidth > 1060) return;
    [
      ["cvShot", 0.3, 0.69],
      ["ivShot", 0.11, 0.37],
    ].forEach(function (x) {
      var s = byId(x[0]);
      if (!s) return;
      var i = s.querySelector(".shot-inner");
      if (!i) return;
      s.scrollLeft = Math.max(0, i.clientWidth * x[1] - s.clientWidth / 2);
      s.scrollTop = Math.max(0, i.clientHeight * x[2] - s.clientHeight / 2);
    });
  }
  addEventListener("resize", fitShots);

  var STEP = {
    job: function (n) {
      var pane = root.querySelector('[data-pane="job"]'),
        L = function (r) {
          return pane.querySelector('[data-r="' + r + '"]');
        };
      if (n === 1) {
        comment("<p>先别急着投。这份 JD，我帮你读一遍。</p>", {});
        pane.classList.remove("scan");
        void pane.offsetWidth;
        pane.classList.add("scan");
      }
      if (n === 2) {
        [
          ["a", "ok", "你做过"],
          ["b", "q", "要问你"],
          ["c", "later", "加分项，先放"],
          ["d", "skip", "谁都会写"],
        ].forEach(function (x, i) {
          setTimeout(
            function () {
              var l = L(x[0]);
              if (jobA && x[0] === "b") return;
              l.classList.add(x[1]);
              l.querySelector(".tag").textContent = x[2];
            },
            reduce ? 0 : i * 240,
          );
        });
        comment(
          "<p>四条里，真正决定投不投的是前三条。第 4 条谁都会写，不用花力气。</p>",
          {},
        );
      }
      if (n === 3 && !jobA) {
        var c = comment(
          '<span class="quote">2. 能设计效果评估，判断模型是否真的变好</span><p>你简历里写了「120 条测试用例」。这 120 条，<strong>是你自己设计的吗？</strong></p><div class="opts"><button data-a="yes">是我设计的，还定了通过标准</button><button data-a="no">主要是抽检，测试集是算法同学给的</button></div>',
          { ask: 1 },
        );
        c.querySelectorAll(".opts button").forEach(function (b) {
          b.addEventListener("click", function () {
            answerJob(b.dataset.a);
          });
        });
      }
    },
    resume: function (n) {
      if (n === 1) {
        var w = $("#cvShotWrap");
        w.classList.add("flash");
        setTimeout(function () {
          w.classList.remove("flash");
        }, 1400);
        comment(
          '<span class="quote">整理 120 条高频问题测试用例，核对回答准确性与引用来源。</span><p>数字都在，但「怎么算通过」没写。HR 看不出这 120 条是你设计的，还是别人给的。</p><p style="margin-top:6px;font-size:11.5px;color:var(--muted)">左下可以切换「改动标记 / 干净版」。</p>',
          {},
        );
      }
      if (n === 2 && !cvDone) {
        var c = comment(
          '<p style="font-size:10px;font-family:FirstLightKode;letter-spacing:.08em;color:var(--muted)">1 处待确认 · 工作经历</p><div class="diff"><del>从高频问题中整理 120 条测试用例，检查回答准确性和来源是否一致。</del><ins>整理 120 条高频问题测试用例，核对回答准确性与引用来源。</ins></div><p style="margin-top:8px;font-size:11.5px;color:var(--muted)">收紧重复表达，保留测试规模与检查内容。</p><div class="act"><button class="yes">接受修改</button><button class="no">先不改</button></div>',
          { ask: 1 },
        );
        c.querySelector(".yes").addEventListener("click", function () {
          decideCV(true);
        });
        c.querySelector(".no").addEventListener("click", function () {
          decideCV(false);
        });
      }
      if (n === 3 && !cvDone) {
        comment(
          "<p>不管改不改，这一句还缺一个「怎么算通过」。下一页，我们就练这个。</p>",
          { keep: true },
        );
      }
    },
    interview: function (n) {
      if (n === 1) {
        comment(
          "<p>这道题不是随机题库，是从这份 JD 和你的简历里出的。先看一遍示范——<strong>不打分</strong>。</p>",
          {},
        );
      }
      if (n === 2) {
        openIV(true);
        comment(
          "<p>我在听。这是示范回答，不是标准答案——重点看它哪里会被追问。</p>",
          {},
        );
      }
      if (n === 3) showIvNotes();
      if (n === 4) reviewIV();
    },
  };
  function answerJob(a) {
    if (jobA) return;
    jobA = a;
    var l = root.querySelector('[data-pane="job"] [data-r="b"]');
    l.classList.remove("q");
    var cm = rail.querySelector(".cm.cm-ask");
    if (cm) {
      cm.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("sel", b.dataset.a === a);
      });
      cm.classList.remove("cm-ask");
    }
    if (a === "yes") {
      l.classList.add("ok");
      l.querySelector(".tag").textContent = "你确认过";
      $("#verdictNote").textContent = "先补 1 条：商业化";
      comment(
        "<p>那这条算你的。三条里你有两条——<strong>值得投</strong>。商业化先放，面试时我教你怎么说。</p>",
        { saved: 1 },
      );
    } else {
      l.classList.add("later");
      l.querySelector(".tag").textContent = "本周补";
      $("#verdictNote").textContent = "先补 1 条：评测";
      comment(
        "<p>那这条先别写死。这周我陪你设计一版评测集：定问题、定通过标准，跑完再投。</p>",
        { saved: 1 },
      );
    }
    $("#verdictBadge").classList.add("on");
    markDone("job");
    chapterProgress("job", 3, 3);
  }
  function seg(v) {
    $("#cvShot").classList.toggle("clean", v === "clean");
    root.querySelectorAll(".shot-seg button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === v));
    });
  }
  root.querySelectorAll(".shot-seg button").forEach(function (b) {
    b.addEventListener("click", function () {
      seg(b.dataset.v);
    });
  });
  function decideCV(ok) {
    if (cvDone) return;
    cvDone = true;
    var st = $("#cvStamp");
    st.textContent = ok ? "已采纳" : "保留原句";
    st.classList.add("on");
    seg(ok ? "clean" : "marks");
    var note = rail.querySelector(".cm.cm-ask");
    if (note) {
      note.classList.remove("cm-ask");
      note.querySelector(".act").innerHTML =
        '<span style="font-size:11.5px;color:var(--' +
        (ok ? "sage" : "muted") +
        ')">' +
        (ok ? "✓ 已写入这一版" : "✓ 原句保留，没有改动") +
        "</span>";
    }
    comment(
      ok
        ? "<p>好。改的是表达，不是事实。每个数字都还是你的。</p>"
        : "<p>行，原句保留。但面试官问起这 120 条，你得能说清怎么定的。</p>",
      { saved: 1 },
    );
    markDone("resume");
    chapterProgress("resume", 3, 3);
  }
  $("#cvPin").addEventListener("click", function () {
    var w = $("#cvShotWrap");
    w.classList.add("flash");
    setTimeout(function () {
      w.classList.remove("flash");
    }, 900);
    if (!cvDone) {
      // Re-open the unresolved choice even after scrolling past its first reveal.
      rail.querySelectorAll(".cm").forEach(function (node) {
        if (node.querySelector(".act")) node.remove();
      });
      STEP.resume(2);
    }
  });

  /* ---------- conceptual interview playback ---------- */
  var wave = $("#ivWave");
  for (var wi = 0; wi < 64; wi++) {
    var bar = document.createElement("i");
    bar.style.height =
      18 + Math.abs(Math.sin(wi * 1.7) * Math.cos(wi * 0.37)) * 82 + "%";
    wave.appendChild(bar);
  }
  var ivPos = 0,
    ivPlaying = false,
    ivLast = 0,
    ivOpen = false,
    ivAdded = false,
    ivNotes = false,
    ivReviewed = false,
    ivDur = 70;
  function fmt(s) {
    s = Math.max(0, Math.min(ivDur, Math.round(s)));
    return (
      ("0" + Math.floor(s / 60)).slice(-2) + ":" + ("0" + (s % 60)).slice(-2)
    );
  }
  function renderIV() {
    var pct = (ivPos / ivDur) * 100;
    $("#ivHead").style.left = pct + "%";
    var bars = wave.children,
      k = Math.floor((ivPos / ivDur) * bars.length);
    for (var i = 0; i < bars.length; i++) bars[i].classList.toggle("p", i < k);
    $("#ivTime").textContent = fmt(ivPos) + " / 01:10";
    var cur = null;
    root.querySelectorAll("#ivScript p[data-t]").forEach(function (p) {
      var on = +p.dataset.t <= ivPos;
      p.classList.toggle("seen", on);
      p.classList.remove("cur");
      if (on) cur = p;
    });
    if (cur) cur.classList.add("cur");
    root.querySelectorAll(".iv-dot").forEach(function (d) {
      d.classList.toggle("lit", +d.dataset.t <= ivPos);
    });
    var segs = root.querySelectorAll("#ivStruct button"),
      si = ivPos < 10 ? 0 : ivPos < 35 ? 1 : ivPos < 50 ? 2 : 3;
    for (var j = 0; j < segs.length; j++)
      segs[j].classList.toggle("on", j === si);
  }
  function tick(now) {
    if (!ivPlaying) return;
    if (!ivLast) ivLast = now;
    var dt = (now - ivLast) / 1000;
    ivLast = now;
    ivPos = Math.min(ivDur, ivPos + dt * 5);
    renderIV();
    if (ivPos >= ivDur) {
      ivPlaying = false;
      $("#ivPlay").textContent = "↻";
      return;
    }
    requestAnimationFrame(tick);
  }
  function playIV() {
    if (ivPlaying) {
      ivPlaying = false;
      $("#ivPlay").textContent = "▶";
      return;
    }
    if (ivPos >= ivDur) ivPos = 0;
    ivPlaying = true;
    ivLast = 0;
    $("#ivPlay").textContent = "❚❚";
    requestAnimationFrame(tick);
  }
  function seek(s) {
    openIV(false);
    ivPos = Math.max(0, Math.min(ivDur, s));
    renderIV();
  }
  function openIV(autoplay) {
    if (!ivOpen) {
      ivOpen = true;
      $("#ivLive").classList.add("on");
      $("#ivLive").setAttribute("aria-hidden", "false");
      renderIV();
    }
    if (autoplay && !reduce && !ivPlaying && ivPos < ivDur) playIV();
  }
  function closeIV() {
    ivPlaying = false;
    ivOpen = false;
    $("#ivLive").classList.remove("on");
    $("#ivLive").setAttribute("aria-hidden", "true");
    $("#ivPlay").textContent = "▶";
  }
  $("#ivPlay").addEventListener("click", function () {
    if (!ivOpen) openIV(false);
    playIV();
  });
  $("#ivTrack").addEventListener("click", function (e) {
    var r = this.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * ivDur);
  });
  $("#ivHot").addEventListener("click", function () {
    openIV(true);
  });
  $("#ivHotMobile").addEventListener("click", function () {
    openIV(true);
  });
  $("#ivBack").addEventListener("click", closeIV);
  root.querySelectorAll(".iv-dot").forEach(function (d) {
    d.addEventListener("click", function (e) {
      e.stopPropagation();
      seek(+d.dataset.t);
    });
  });
  root.querySelectorAll("#ivStruct button").forEach(function (b) {
    b.addEventListener("click", function () {
      seek(+b.dataset.s);
    });
  });
  function ivNote(t, title, html, sec) {
    var c = comment(
      '<span class="quote">' + fmt(sec) + " · " + title + "</span>" + html,
      { when: "追问", keep: 1, seek: 1 },
    );
    c.addEventListener("click", function () {
      seek(sec);
    });
  }
  function showIvNotes() {
    if (ivNotes) return;
    ivNotes = true;
    ivNote(
      "00:12",
      "抽 50 条",
      "<p>面试官会追问：抽多少、怎么抽、<strong>谁来判断对错</strong>？你说了 50 条，很好，把「谁判断」补上。</p>",
      12,
    );
    ivNote(
      "00:38",
      "掉了 6 个点",
      "<p>这句有数字，但没说多久发现。你后面说了「两天内」——<strong>把它挪到前面</strong>。</p>",
      38,
    );
    ivNote(
      "00:52",
      "没有硬数字",
      "<p>诚实是加分项。下一句要接「所以我补了什么」，不然会<strong>停在这里</strong>。</p>",
      52,
    );
  }
  $("#ivAddBtn").addEventListener("click", function () {
    var r = $("#ivAddRow");
    r.classList.add("on");
    var i = $("#ivAddInput");
    if (!i.value) i.value = "预期是把准确率从 78% 提到 85%，实际到了 83%。";
    i.focus();
    i.select();
  });
  $("#ivAddInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#ivSave").click();
    }
  });
  $("#ivSave").addEventListener("click", function () {
    var v =
      $("#ivAddInput").value.trim() ||
      "预期是把准确率从 78% 提到 85%，实际到了 83%。";
    if (v.length > 80) v = v.slice(0, 80);
    $("#ivAddedText").textContent = v;
    $("#ivAdded").classList.add("show");
    $("#ivAddRow").classList.remove("on");
    $("#ivRevA").textContent = "补上了";
    $("#ivRevAText").textContent = v;
    ivAdded = true;
    seek(65);
    comment(
      "<p>好，这一句补上了。先给预期、再给实际，面试官就不用追着问。</p>",
      { saved: 1 },
    );
  });
  function reviewIV() {
    openIV(false);
    if (ivReviewed) return;
    ivReviewed = true;
    $("#ivReview").classList.add("on");
    if (!ivAdded) {
      $("#ivRevA").textContent = "待补";
      $("#ivRevAText").textContent = "预期和实际，还差一个数字";
    }
    comment(
      "<p>这张复盘我替你留着。下次面试前一晚，我们<strong>按时间戳</strong>再过一遍。</p>",
      { saved: 1 },
    );
    markDone("interview");
    chapterProgress("interview", 4, 4);
    if (typeof bText !== "undefined") {
      bText.textContent = "复盘存好了。面试前一晚见。";
    }
  }

  /* steps observer */
  railHead("看岗位");
  observe(
    function (es) {
      es.forEach(function (e) {
        root.classList.toggle("in-walk", e.isIntersecting);
      });
    },
    { threshold: 0 },
  ).observe(track);
  var stepIO = observe(
    function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var s = (e.target.dataset.s || "").split(":");
        if (!s[0]) return;
        var t = s[0],
          n = +s[1];
        setTab(t);
        for (var i = WS[t] + 1; i <= n; i++) {
          STEP[t](i);
        }
        if (n > WS[t]) WS[t] = n;
        var p = Math.max(n, WS[t]);
        if (
          (t === "job" && p >= 3 && !jobA) ||
          (t === "resume" && p >= 3 && !cvDone)
        )
          p = 2.5;
        chapterProgress(t, p, t === "interview" ? 4 : 3);
      });
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  root.querySelectorAll(".wsteps i").forEach(function (i) {
    stepIO.observe(i);
  });
  root.querySelectorAll(".shot-inner img").forEach(function (img) {
    if (!img.complete) img.addEventListener("load", fitShots);
  });
  fitShots();

  /* ---------- contact moments ---------- */
  var buddy = $("#buddy"),
    bText = $("#buddyText"),
    bImg = $("#buddyImg"),
    buddyOff = false,
    typed = false;
  var LINES = {
    how: ["我们一起走一遍，你来回答。", "mentor-wave"],
    job: ["先看岗位，再决定投不投。", "mentor-reading"],
    resume: ["是真的，就点上。", "mentor-thinking"],
    interview: ["别紧张，这里不打分。", "mentor-point-right"],
    contact: ["选个时间吧，我到点来找你。", "mentor-point-right"],
    light: ["你做完的每一件，我都记着。", "mentor-done"],
    faq: ["还有想问的？直接跟我说就行。", "mentor-thinking"],
  };
  function say(key) {
    var l = LINES[key];
    if (!l) return;
    bText.textContent = l[0];
    bImg.src = "/first-light/D-mentor/" + l[1] + ".webp";
  }
  var heroIO = observe(
    function (es) {
      es.forEach(function (e) {
        if (buddyOff) return;
        buddy.classList.toggle("on", !e.isIntersecting && !endVisible);
      });
    },
    { threshold: 0.15 },
  );
  heroIO.observe(hero);
  var endVisible = false;
  observe(
    function (es) {
      es.forEach(function (e) {
        endVisible = e.isIntersecting;
        if (endVisible) buddy.classList.remove("on");
      });
    },
    { threshold: 0.3 },
  ).observe(root.querySelector(".end"));
  ["how", "contact", "light", "faq"].forEach(function (id) {
    var el = byId(id);
    if (el)
      observe(
        function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) say(id);
          });
        },
        { rootMargin: "-50% 0px -50% 0px" },
      ).observe(el);
  });
  function backToAsk() {
    $("#ask").scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
    setTimeout(
      function () {
        $("#q").focus({ preventScroll: true });
      },
      reduce ? 0 : 600,
    );
  }
  buddy.addEventListener("click", function (e) {
    if (e.target.id === "buddyX") {
      buddyOff = true;
      buddy.classList.remove("on");
      e.stopPropagation();
      return;
    }
    backToAsk();
  });
  buddy.addEventListener("keydown", function (e) {
    if (e.key === "Enter") backToAsk();
  });
  /* idle nudge: if nothing happens for a while, the mentor reaches out */
  $("#q").addEventListener("input", function () {
    typed = true;
  });
  setTimeout(
    function () {
      if (typed || scrollY > 200) return;
      mentor("point", "不知道怎么说？点下面一句就行");
      $(".voices").classList.add("nudge");
      setTimeout(function () {
        $(".voices").classList.remove("nudge");
      }, 3400);
    },
    reduce ? 999999 : 11000,
  );
  /* choose a time -> the phone shows what I'd say then */
  root.querySelectorAll("#times button").forEach(function (b) {
    b.addEventListener("click", function () {
      root.querySelectorAll("#times button").forEach(function (x) {
        x.classList.toggle("sel", x === b);
      });
      var scr = root.querySelector(".screen"),
        t = b.dataset.t;
      $("#clock").textContent = t === "周末" ? "10:00" : t;
      $("#date").textContent = t === "周末" ? "星期六" : "明天";
      var n = document.createElement("div");
      n.className = "nt fresh";
      n.innerHTML =
        '<img src="/logo.png" alt=""><p><b>益职 · ' +
        (t === "周末" ? "周五 18:00" : t) +
        "</b>" +
        b.dataset.m +
        "</p>";
      var first = scr.querySelector(".nt");
      scr.insertBefore(n, first);
      requestAnimationFrame(function () {
        n.classList.add("in");
      });
      var all = scr.querySelectorAll(".nt");
      if (all.length > 3) all[all.length - 1].remove();
      setTimeout(function () {
        n.classList.remove("fresh");
      }, 1800);
      toast(
        t === "周末"
          ? "好，周末不打扰你。（示例）"
          : "好，明天 " + t + " 我来找你。（示例）",
      );
      say("contact");
      bText.textContent =
        "记住了，" + (t === "周末" ? "周末不打扰你。" : "明天 " + t + " 见。");
    });
  });

  /* ---------- phone clock & reveals ---------- */
  var nd = new Date(),
    dn = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  $("#clock").textContent =
    ("0" + nd.getHours()).slice(-2) + ":" + ("0" + nd.getMinutes()).slice(-2);
  $("#date").textContent =
    nd.getMonth() + 1 + "月" + nd.getDate() + "日 " + dn[nd.getDay()];
  var io = observe(
    function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        if (e.target.id === "hand")
          root.querySelectorAll(".nt").forEach(function (n, i) {
            setTimeout(
              function () {
                n.classList.add("in");
              },
              reduce ? 0 : 400 + i * 700,
            );
          });
        if (e.target.querySelectorAll)
          e.target.querySelectorAll("canvas[data-n]").forEach(drawField);
        io.unobserve(e.target);
      });
    },
    { threshold: 0.2 },
  );
  root.querySelectorAll(".reveal,#hand").forEach(function (el) {
    io.observe(el);
  });

  const onSubmit = (event) => {
    event.preventDefault();
    hear(byId("q").value);
  };
  byId("ask").addEventListener("submit", onSubmit, {
    signal: controller.signal,
  });
  root.dataset.ready = "true";
  return () => {
    disposed = true;
    controller.abort();
    timers.forEach((id) => window.clearTimeout(id));
    frames.forEach((id) => window.cancelAnimationFrame(id));
    observers.forEach((observer) => observer.disconnect());
    root.classList.remove("in-walk");
    delete root.dataset.ready;
  };
}
