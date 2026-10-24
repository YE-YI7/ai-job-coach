/** User-selected prototype, compiled into SSR markup; never fetched from disk at runtime. */
export const FIRST_LIGHT_SOURCE_SHA =
  "1ef10ac1819d0f03dcb409cf547a951a38b96316108fc5b527c4ac2d6cc0efcf";
export const FIRST_LIGHT_HTML = `<div class="grain" aria-hidden="true"></div>
<canvas id="fx" aria-hidden="true"></canvas>

<nav><div class="wrap"><div class="bar glass">
  <a class="logo" href="#"><img src="/logo.png" alt="">益职</a>
  <div class="nav-links"><a href="#walk">一起走一遍</a><a href="#light">你的光</a><a href="#faq">问题</a><a class="btn btn-ink" href="/cockpit?entry=one_sentence">开始聊聊</a></div>
</div></div></nav>

<main>
<header class="hero" id="top">
  <div class="wall" aria-hidden="true"></div>
  <div class="beam" aria-hidden="true"></div>
  <img class="leaf" src="/first-light/C-objects/plant-shadow.webp" alt="" aria-hidden="true">
  <canvas id="dustCanvas" aria-hidden="true"></canvas>

  <div class="wrap">
    <div class="hero-grid">
      <div>
        <span class="kicker glass fade f1"><img src="/logo.png" alt="">求职这几个月，有人陪你</span>
        <h1 id="h1" class=""><span class="l">陪你，</span><span class="l warm"><span class="nw">一直到</span><span class="nw">找到工作。</span></span></h1>
        <p class="lede fade f2">投什么、简历怎么写、面试怎么答——<b>跟我说说你卡在哪儿</b>。一起读材料、补证据、改简历和练面试，把今天能做的一步走清楚。</p>
        <form class="ask fade f3" id="ask">
          <label for="q">你现在卡在哪儿？<span>交互演示 · 不会发送</span></label>
          <textarea maxlength="1000" id="q" placeholder="比如：投了 40 份，只有 2 个面试。"></textarea>
          <div class="ask-row">
            <span class="promise">没有 JD 也能开始 · 不编经历 · 不承诺 offer</span>
            <button class="btn btn-tomato" type="submit">跟我说说 →</button>
          </div>
        <p class="demo-note">互动示例，不调用模型、不保存输入。<a href="/cockpit?entry=one_sentence">进入工作区 →</a></p></form>
      </div>

      <div class="scene fade f4" id="scene">
        <div class="today glass" id="today">
          <div class="note paper" id="note">
            <div class="note-text" id="noteText">早上好。昨天你投了 3 个 AI 产品岗——今天我们把简历里最弱的那段补上，下午就能再投。</div>
            <div class="sig"><b>—— 你的导师</b><span id="noteTime">刚刚</span></div>
          </div>
          <div class="t-head"><h3>今天</h3><span id="dayTag">第 7 天 · 示例</span></div>
          <ul class="list" id="list"></ul>
          <div class="lights"><span>你的光 · 本周</span><span class="dots" id="dots"></span></div>
          <span class="demo">示例 · 虚构</span>
        </div>
        <div class="mentor" id="mentor" aria-hidden="true">
          <div class="halo"></div>
          <img data-s="wave" class="on" src="/first-light/D-mentor/mentor-wave.webp" alt="">
          <img data-s="thinking" src="/first-light/D-mentor/mentor-thinking.webp" alt="">
          <img data-s="point" src="/first-light/D-mentor/mentor-point-right.webp" alt="">
          <img data-s="reading" src="/first-light/D-mentor/mentor-reading.webp" alt="">
          <img data-s="done" src="/first-light/D-mentor/mentor-done.webp" alt="">
          <span class="state" id="mstate"><i></i>在呢</span>
        </div>
      </div>
    </div>
  </div>

  <div class="voices" aria-label="其他人说过的话，点一句试试">
    <h4>这些话，你说过哪一句？</h4>
    <div class="row" id="row1"></div>
    <div class="row r2" id="row2"></div>
  </div>
</header>

<section class="walk" id="walk">
  <div class="walk-head wrap reveal" id="how">
    <div class="eyebrow">Walk it with me</div>
    <h2 class="disp">接下来几分钟，<br>我们一起走一遍。</h2>
    <p class="sub">一个虚构的同学，正在找 AI 产品经理的工作。往下滑，导师问到你的时候，你替他回答。</p>
  </div>

  <div class="walk-track" id="track">
    <div class="walk-sticky">
      <div class="backdrop" aria-hidden="true">
        <div class="bd bd-morning on" data-bd="job"></div>
        <div class="bd bd-noon" data-bd="resume"></div>
        <div class="bd bd-dusk" data-bd="interview"></div>
        <div class="bd-beam"></div>
      </div>
      <div class="wrap walk-grid">
        <ol class="chapters" id="chapters">
          <li data-ch="job" class="on"><span class="mono">01</span><b class="disp">看岗位</b><p>先读懂它要什么，再决定投不投。</p><em>你拿到：一张岗位判断</em><i class="bar"><s></s></i></li>
          <li data-ch="resume"><span class="mono">02</span><b class="disp">改简历</b><p>一句一句，改到你自己说得清。</p><em>你拿到：一岗一版的简历</em><i class="bar"><s></s></i></li>
          <li data-ch="interview"><span class="mono">03</span><b class="disp">练面试</b><p>先陪你练，再陪你复盘。</p><em>你拿到：一份标注过的复盘</em><i class="bar"><s></s></i></li>
        </ol>

        <div class="win" id="win">
          <div class="win-bar"><i></i><i></i><i></i><span id="winTitle">益职 · 作战盘 — AI 应用产品经理</span><small class="mono">示例 · 虚构</small></div>
          <div class="win-body">
            <div class="side" aria-hidden="true">
              <span data-tab="job" class="on"><svg viewBox="0 0 24 24"><path d="M4 7h16v12H4zM9 7V5h6v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>岗位</span>
              <span data-tab="resume"><svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>简历</span>
              <span data-tab="interview"><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>面试</span>
            </div>

            <div class="panes">
              <!-- JOB -->
              <article class="pane on" data-pane="job">
                <div class="job-sheet">
                  <header class="doc-h"><div><small class="mono">JD · 示例科技 · 上海 · 3–5 年</small><h3 class="disp">AI 应用产品经理</h3></div><span class="verdict-badge" id="verdictBadge">判断：<b>值得投</b><br><span id="verdictNote">先补 1 条</span></span></header>
                  <div class="doc-sec">岗位职责</div>
                  <p class="doc-p">负责客服知识助手等 AI 产品的需求调研与迭代；和算法、研发一起，把模型能力做成客服真的敢用的产品。</p>
                  <div class="doc-sec">任职要求</div>
                  <ol class="req">
                    <li data-r="a"><span>1. 能独立负责 AI 产品的需求调研与迭代</span><b class="tag"></b></li>
                    <li data-r="b"><span>2. 能设计效果评估，判断模型是否真的变好</span><b class="tag"></b></li>
                    <li data-r="c"><span>3. 有商业化或收入增长的经验</span><b class="tag"></b></li>
                    <li data-r="d"><span>4. 熟悉 Figma 等原型工具</span><b class="tag"></b></li>
                  </ol>
                  <div class="doc-end"><span class="mono">读完了</span><span>只差一个决定：投，还是先补一条。</span></div>
                  <div class="scanline"></div>
                </div>
              </article>

              <!-- RESUME -->
              <article class="pane" data-pane="resume">
                <div class="shot-wrap" id="cvShotWrap">
                  <div class="shot" id="cvShot">
                    <div class="shot-inner">
                      <img class="marks-img" src="/first-light/shots/resume-marks.webp" alt="真实简历修改页：一处改动已标出">
                      <img class="clean-img" src="/first-light/shots/resume-clean.webp" alt="真实简历修改页：干净版">
                      <button class="cv-pin" id="cvPin" type="button" aria-label="查看这一处改动">1</button>
                      <span class="cv-stamp" id="cvStamp"></span>
                    </div>
                  </div>
                  <div class="shot-bar">
                    <div class="shot-seg" role="group" aria-label="查看方式">
                      <button type="button" data-v="marks" aria-pressed="true">改动标记</button>
                      <button type="button" data-v="clean" aria-pressed="false">干净版</button>
                    </div>
                    <span class="shot-cap">真实页面 · 示例数据</span>
                  </div>
                </div>
              </article>

              <!-- INTERVIEW -->
              <article class="pane" data-pane="interview">
                <div class="shot-wrap">
                  <div class="shot" id="ivShot">
                    <div class="shot-inner">
                      <img src="/first-light/shots/interview-prep.webp" alt="真实面试准备页：岗位重点题，练一道题按钮">
                      <button class="hot" id="ivHot" type="button" aria-label="打开练一道题的示范"><span>点这里，练一遍</span></button>
                    </div>
                  </div>
                  <div class="shot-bar">
                    <span class="shot-cap">真实页面 · 示例数据</span>
                    <button class="pane-cta" id="ivHotMobile" type="button">练一道题 →</button>
                  </div>
                </div>

                <div class="iv-live" id="ivLive" aria-hidden="true">
                  <div class="iv-live-h"><span>示范回答 · 文字回放 · 概念演示</span><button type="button" id="ivBack">← 返回题目</button></div>
                  <p class="iv-live-q">你们如何判断大模型效果真的变好了？</p>
                  <div class="iv-tl">
                    <button class="iv-play" id="ivPlay" type="button" aria-label="播放或暂停示范回答">▶</button>
                    <div class="iv-track" id="ivTrack">
                      <div class="iv-wave" id="ivWave"></div>
                      <div class="iv-head" id="ivHead"></div>
                      <button class="iv-dot" data-t="12" style="left:17.1%" type="button" aria-label="跳到 00:12 的追问">1</button>
                      <button class="iv-dot" data-t="38" style="left:54.3%" type="button" aria-label="跳到 00:38 的追问">2</button>
                      <button class="iv-dot" data-t="52" style="left:74.3%" type="button" aria-label="跳到 00:52 的追问">3</button>
                    </div>
                    <span class="iv-time" id="ivTime">00:00 / 01:10</span>
                  </div>
                  <div class="iv-script" id="ivScript">
                    <p data-t="4"><time>00:04</time><span>我们一开始是人工抽检，每周从线上日志里抽 50 条，一条条看。</span></p>
                    <p data-t="12"><time>00:12</time><span>后来发现抽检看不出趋势，我就整理了 120 条高频问题做测试集。</span></p>
                    <p data-t="23"><time>00:23</time><span>每次迭代前后各跑一遍，看回答准确率和引用一致率。</span></p>
                    <p data-t="38"><time>00:38</time><span>有一次上线后准确率掉了 6 个点，我们两天内发现，回滚了。</span></p>
                    <p data-t="52"><time>00:52</time><span>不过说实话，最后有没有达到预期，我没有一个特别硬的数字。</span></p>
                    <p class="added" id="ivAdded"><time>01:05</time><span id="ivAddedText"></span></p>
                  </div>
                  <div class="iv-struct" id="ivStruct" aria-label="这段回答的结构，点一段跳过去">
                    <button type="button" data-s="0"><i>1</i>背景</button>
                    <button type="button" data-s="10"><i>2</i>做法</button>
                    <button type="button" data-s="35"><i>3</i>结果</button>
                    <button type="button" data-s="50"><i>4</i>缺口</button>
                  </div>
                  <div class="iv-add">
                    <button class="iv-addbtn" id="ivAddBtn" type="button">补一句</button>
                    <div class="iv-add-row" id="ivAddRow">
                      <input id="ivAddInput" type="text" maxlength="80" placeholder="预期多少，实际多少？">
                      <button type="button" id="ivSave">存进去</button>
                    </div>
                  </div>
                  <div class="iv-review" id="ivReview">
                    <h4>这一题的复盘</h4>
                    <ul>
                      <li class="g"><b>说清了</b>测试集怎么来的、掉点怎么发现的</li>
                      <li class="a"><b id="ivRevA">待补</b><span id="ivRevAText">预期和实际，还差一个数字</span></li>
                      <li class="r"><b>会被追问</b>没过的那些题，后来怎么办了</li>
                    </ul>
                    <div class="save">✓ 已存入复盘 · 下次面试前一晚，按时间戳再过一遍</div>
                  </div>
                </div>
              </article>
            </div>

            <aside class="rail" id="rail" aria-live="polite"></aside>
          </div>
        </div>
      </div>
    </div>
    <div class="wsteps" aria-hidden="true">
      <i data-s="job:1"></i><i data-s="job:2"></i><i data-s="job:3"></i>
      <i data-s="resume:1"></i><i data-s="resume:2"></i><i data-s="resume:3"></i>
      <i data-s="interview:1"></i><i data-s="interview:2"></i><i data-s="interview:3"></i><i data-s="interview:4"></i><i class="tail"></i>
    </div>
  </div>
</section>



<section id="contact" style="padding-bottom:0">
  <div class="wrap contact">
    <div class="reveal" style="padding-bottom:130px">
      <div class="eyebrow">It checks in</div>
      <h2>它会在对的时候<br>来找你。</h2>
      <p class="sub">不是群发提醒。它记得你在准备什么、哪天面试、哪道题卡过——然后只说一句刚好的话。</p>
      <ul class="quote-list">
        <li><span>两天没来</span>「今天只做一件 5 分钟的？」</li>
        <li><span>面试前一晚</span>「上次被问倒的那题，再说一遍给我听？」</li>
        <li><span>周五傍晚</span>「这周辛苦了。周末我们不排任务。」</li>
      </ul>
      <div class="times-q">你希望我什么时候来找你？</div>
      <div class="times" id="times">
        <button type="button" data-t="08:00" data-m="早。今天就一件：把昨天改好的那段简历投出去。">早上 8:00</button>
        <button type="button" data-t="12:30" data-m="吃完饭了吗？花 10 分钟看 2 个岗位就好。">午休 12:30</button>
        <button type="button" data-t="21:00" data-m="今天辛苦了。睡前把那道面试题说一遍给我听？">晚上 21:00</button>
        <button type="button" data-t="周末" data-m="好，周末不打扰你。周一早上见。">周末别找我</button>
      </div>
      <span class="soon">设计中 · 以上为示例</span>
    </div>
    <div class="handwrap" id="hand">
      <img src="/first-light/E-phone/hand-phone.webp" alt="">
      <div class="screen">
        <div class="clock" id="clock">21:40</div>
        <div class="date" id="date">星期四</div>
        <div class="nt"><img src="/logo.png" alt=""><p><b>益职 · 21:40</b>两天没见你了。今天只做一件 5 分钟的？</p></div>
        <div class="nt"><img src="/logo.png" alt=""><p><b>益职 · 面试前一晚</b>上次被问倒的那题，再说一遍给我听？</p></div>
        <div class="nt"><img src="/logo.png" alt=""><p><b>益职 · 周五 18:00</b>这周辛苦了。周末不排任务。</p></div>
      </div>
      <img class="mug" src="/first-light/C-objects/steaming-mug.webp" alt="">
    </div>
  </div>
</section>

<section class="lightsec" id="light">
  <div class="wrap reveal">
    <div class="eyebrow">Your light</div>
    <h2>你做完的每件事，<br>都会变成一粒光。</h2>
    <p class="sub" style="margin:0 auto">没有分数，也没有进度条。一个月后回头看，是一片你自己攒下的光。（以下为虚构示例）</p>
    <div class="fields">
      <div class="field glass"><canvas data-n="3" data-r="0.18"></canvas><div class="d">DAY 01</div><h3>说出一句困惑</h3><p>缩成 3 个可以去看的方向。</p></div>
      <div class="field glass"><canvas data-n="16" data-r="0.32"></canvas><div class="d">DAY 07</div><h3>划掉一个方向</h3><p>能讲清的事，从 0 件到 4 件。</p></div>
      <div class="field glass"><canvas data-n="58" data-r="0.46"></canvas><div class="d">DAY 30</div><h3>有底气地去投</h3><p>简历对得上方向，追问接得住。</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap letter reveal">
    <div>
      <div class="eyebrow">Why it exists</div>
      <h2>先做一件真的事。</h2>
      <p class="sub">把每一步落在真实的经历、产物和反馈上。</p>
    </div>
    <div class="nb">
      <img src="/first-light/C-objects/open-notebook.webp" alt="">
      <div class="txt">不知道投什么，就先读懂一个岗位。<br>经历说不清，就先补一句真实发生过的事。</div>
      <div class="txt2">益职不承诺 offer，也不替你编经历。<br>把经历说清楚，再用一次练习看看还缺什么。<div class="sig">—— 益职</div></div>
      <span class="draft">不编经历 · 不承诺 offer</span>
    </div>
  </div>
</section>

<section id="faq">
  <div class="wrap reveal">
    <div class="eyebrow">FAQ</div>
    <h2>你可能想问</h2>
    <div class="faq"><details class="glass" open><summary>和直接问豆包、ChatGPT 有什么不一样？</summary><p>通用聊天适合开放式讨论。益职把岗位、真实经历、已确认事实、简历版本和面试准备放在同一个工作区，方便围绕同一个目标继续推进。</p></details><details class="glass"><summary>没有 JD、也没想好方向，能用吗？</summary><p>能。简历、目标岗位、找岗位或一句困惑都可以开始；没有 JD 时不会生成没有依据的匹配分。</p></details><details class="glass"><summary>会帮我包装、编经历吗？</summary><p>不会。只帮你把真实发生过的事说清楚；没有确认过的事实和数字，不写进简历。</p></details><details class="glass"><summary>能保证拿到 offer 吗？</summary><p>不能，也不会这么说。益职提供求职判断、简历修改和面试辅导，不保证录用结果。</p></details><details class="glass"><summary>免费体验是修改整份简历吗？</summary><p>不是。同一账号首次可免费体验修改一段工作、实习或项目经历，仅一次；不是免费改整份简历。其他 AI 操作按页面显示的权益和额度使用。</p></details></div>
  </div>
</section>

<section class="end">
  <div class="wrap reveal">
    <img src="/first-light/D-mentor/mentor-wave.webp" alt="">
    <h2>今天这一件，<br>从一句话开始。</h2>
    <a class="btn btn-tomato" href="/cockpit?entry=one_sentence" style="font-size:17px;padding:15px 32px;margin-top:10px">跟我说说 →</a>
  </div>
</section>
</main>

<footer><div class="wrap"><span>益职 AI · 求职期的每日陪伴</span><span>页面中的任务、经历、进度与通知均为示例 · 不承诺 offer</span><span class="start-links"><a href="/cockpit?entry=resume">从简历开始</a><a href="/cockpit?entry=jd">我有目标岗位</a><a href="/cockpit?entry=find_jobs">帮我找岗位</a><a href="/demo">简历与 PDF 演示</a><a href="/agent">Agent 版</a><a href="/tools/resume-jd-gap">简历 × JD</a><a href="/tools/offer-compare">Offer 比较</a><a href="/tools/interview-review">面试复盘</a><a href="/privacy">隐私说明</a></span></div></footer>
<div class="buddy glass" id="buddy" role="button" tabindex="0" aria-label="回到对话"><img id="buddyImg" src="/first-light/D-mentor/mentor-wave.webp" alt=""><p><b>你的导师</b><span id="buddyText">我在这儿。想说的时候，随时回来。</span></p><button class="x" id="buddyX" aria-label="收起">×</button></div>
<div class="toast glass" id="toast"><img src="/first-light/D-mentor/mentor-done.webp" alt=""><span id="toastText"></span></div>`;
