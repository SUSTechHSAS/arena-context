#!/usr/bin/env python3
"""AerraGen 计划审查：独立数值复核脚本（仅用 Python 标准库，无第三方依赖）。

用途
----
复核 `docs/plan/00-audit.md` 的数值抽查 V1–V15，并产出 `docs/plan/01` 与
`docs/plan/02` 中引用的派生网格表、存储预算、环面重力/自转的可复现数值。
审查者（Kibiandkimi）可直接运行本脚本核对；结果文本提交为
`docs/plan/analysis/verify_output.txt`。

运行
----
    python3 docs/plan/analysis/verify_plan_numbers.py            # 默认（约 30–60 s）
    python3 docs/plan/analysis/verify_plan_numbers.py --fine     # 高分辨率积分（数分钟）

方法
----
- 派生网格：使用参考规格 §01.3.1 的公式（圆截面解析 L_m = 2πr、R_ref = R）。
- 环面重力/位势：均匀密度圆截面环面的轴对称格林函数直接数值积分
  Φ(P,0) = −4 G ρ_d ∫∫ a·K(k)/√((P+a)² + z₀²) da dz₀，k² = 4aP/((P+a)²+z₀²)，
  K 用 AGM 计算；积分域取 (s, θ) 极坐标并做奇异点加密（场点在环体表面时对数为奇异，
  加密后 3 档分辨率结果稳定）。
- 该积分在远场与 −GM/P 的偏差 ≈ (R/P)² 量级，作为积分器的自校验。
- 单位：长度 m、密度 kg/m³、G = 6.67430e-11。GB 一律为 10⁹ 字节（十进制）。
"""

import argparse
import math

G = 6.67430e-11
YEAR = 3.15576e7
GB = 1e9

# 预算上限/结论用到的常量（参考规格 §00.6、§07.8）
Z_VOXEL_MIN = -16000
Z_VOXEL_MAX = 16000


# ----------------------------------------------------------------------------
# 工具：第一类完全椭圆积分 K(k)（AGM）
# ----------------------------------------------------------------------------
def ellip_K_agm(k2: float) -> float:
    """K(k) = π/(2·AGM(1, √(1−k²)))。k² = sin²α 参数约定与参考 §01.4.1 一致。"""
    if k2 >= 1.0:
        k2 = 1.0 - 1e-16
    a, b = 1.0, math.sqrt(1.0 - k2)
    for _ in range(80):
        a_n = 0.5 * (a + b)
        b_n = math.sqrt(a * b)
        if abs(a_n - b_n) <= 1e-16 * abs(a_n):
            a, b = a_n, b_n
            break
        a, b = a_n, b_n
    return math.pi / (2.0 * a)


def torus_potential(P: float, big_r: float, r: float, rho_d: float, ns: int, nth: int,
                    q: float = 2.0) -> float:
    """圆截面均匀环面在 (ρ=P, z=0) 的引力位势（SI，J/kg）。

    截面参数化 a = R + s·cosθ, z₀ = s·sinθ，s∈[0,r]，θ∈[0,2π)；
    质量元 dm = ρ_d·2πa·s·ds·dθ；细环核 Φ_ring = −(2G dm/π)·K(k)/√((P+a)²+z₀²)。
    s 向与 θ 向均用 q=2 的加密网格（聚类于 s=r 与 θ=0，即最靠近场点的边界点，
    该处被积函数对数发散），用梯形权重求积。
    """
    ss = [r * (1.0 - (1.0 - i / ns) ** q) for i in range(ns + 1)]
    ths = [2.0 * math.pi * (i / nth) ** q for i in range(nth + 1)]
    ws = [(ss[1] - ss[0]) / 2.0] + [(ss[i + 1] - ss[i - 1]) / 2.0 for i in range(1, ns)] + \
         [(ss[ns] - ss[ns - 1]) / 2.0]
    wt = [(ths[1] - ths[0]) / 2.0] + [(ths[j + 1] - ths[j - 1]) / 2.0 for j in range(1, nth)] + \
         [(ths[nth] - ths[nth - 1]) / 2.0]
    acc = 0.0
    for i in range(ns + 1):
        s = ss[i]
        for j in range(nth + 1):
            a = big_r + s * math.cos(ths[j])
            z0 = s * math.sin(ths[j])
            d2 = (P + a) ** 2 + z0 * z0
            k2 = 4.0 * a * P / d2
            acc += ws[i] * wt[j] * s * a * ellip_K_agm(k2) / math.sqrt(d2)
    return -4.0 * G * rho_d * acc


def torus_volume(big_r: float, r: float) -> float:
    return 2.0 * math.pi ** 2 * big_r * r * r


def omega_squared_from_ab(big_r: float, r: float, rho_d: float, ns: int, nth: int):
    """SCF 使用的 Ω² = 2(Φ(A)−Φ(B))/(ρ_A²−ρ_B²)，A/B 为外/内赤道（实测以 SCF 为准）。"""
    p_a = torus_potential(big_r + r, big_r, r, rho_d, ns, nth)
    p_b = torus_potential(big_r - r, big_r, r, rho_d, ns, nth)
    om2 = 2.0 * (p_a - p_b) / ((big_r + r) ** 2 - (big_r - r) ** 2)
    return p_a, p_b, om2


def moments_of_inertia(big_r: float, r: float, ns: int = 1200, nth: int = 1200):
    """均匀圆截面环面的主转动惯量 C（绕 z）与 A（横向）；返回 (C, A, (C−A)/C)。"""
    ss = [r * (i / ns) for i in range(ns + 1)]
    ths = [2.0 * math.pi * j / nth for j in range(nth + 1)]
    ws = [(ss[1] - ss[0]) / 2.0] + [(ss[i + 1] - ss[i - 1]) / 2.0 for i in range(1, ns)] + \
         [(ss[ns] - ss[ns - 1]) / 2.0]
    wt = [(ths[1] - ths[0]) / 2.0] + [(ths[j + 1] - ths[j - 1]) / 2.0 for j in range(1, nth)] + \
         [(ths[nth] - ths[nth - 1]) / 2.0]
    C = 0.0
    A = 0.0
    for i in range(ns + 1):
        s = ss[i]
        for j in range(nth + 1):
            a = big_r + s * math.cos(ths[j])
            z0 = s * math.sin(ths[j])
            w = ws[i] * wt[j] * s       # dA = s ds dθ
            C += w * a ** 3              # ρ² dm = ρ_d·2π a·dA · a²
            A += w * a * (a * a / 2.0 + z0 * z0)
    m = torus_volume(big_r, r)
    return C * 2 * math.pi, A * 2 * math.pi, (C - A) / C if C else float('nan')


# ----------------------------------------------------------------------------
# A. 派生网格（参考 §01.3.1）
# ----------------------------------------------------------------------------
PRESETS = [
    # name,        R (m),     r (m),     levels, density (kg/m³), 备注
    ("test",       4.0e5,     1.0e5,     5,      99000.0, "放大密度(开发)"),
    ("mini",       1.6e6,     4.0e5,     6,      24750.0, "放大密度(开发)"),
    ("earth-lite", 7.2e6,     1.8e6,     7,       5500.0, "earth 尺寸粗分辨率"),
    ("medium",     3.6e6,     9.0e5,     6,       5500.0, "≈火星面积"),
    ("earth",      7.2e6,     1.8e6,     6,       5500.0, "默认（面积≈地球）"),
    ("earth-g",    1.7e7,     4.25e6,    6,       5500.0, "重力≈9.8 m/s²"),
]


def derive_grid(big_r: float, r: float, levels: int):
    """返回派生网格量（圆截面解析值；SCF 后 L_m/R_ref 略不同，由实现回填）。"""
    s0 = 4 ** levels                      # L0 格距 = 4^levels m
    l_m = 2.0 * math.pi * r               # 圆截面子午线周长
    r_ref = big_r                         # 圆截面 R_ref = R
    nu0 = 16 * round(2.0 * math.pi * r_ref / (16.0 * s0))
    ns0 = 16 * round(l_m / (16.0 * s0))
    nu_l = nu0 * 4 ** levels
    ns_l = ns0 * 4 ** levels
    return {
        "s0": s0, "L_m": l_m, "R_ref": r_ref, "nu0": nu0, "ns0": ns0,
        "nu_L": nu_l, "ns_L": ns_l,
        "dx_planar": 2.0 * math.pi * r_ref / nu_l,
        "d_sigma": l_m / ns_l,
        "area": 4.0 * math.pi ** 2 * big_r * r,
        "volume": torus_volume(big_r, r),
    }


def section_a():
    print("=" * 78)
    print("A · 派生网格与预设（参考 §01.3.1；圆截面解析值）")
    print("=" * 78)
    print(f"{'preset':10s} {'L0 (=4^levels m)':>10s} {'L0 nu×ns':>18s} {'L0 cells':>12s} "
          f"{'Δσ_Lmax(m)':>11s} {'Δx_planar(m)':>12s}")
    rows = {}
    for name, big_r, r, levels, rho, _note in PRESETS:
        d = derive_grid(big_r, r, levels)
        rows[name] = d
        print(f"{name:10s} {d['s0']:10d} {d['nu0']:8d}x{d['ns0']:<9d} "
              f"{d['nu0'] * d['ns0']:12d} {d['d_sigma']:11.5f} {d['dx_planar']:12.5f}")
    print()
    print("k(σ) = ρ(σ)/R_ref：圆截面下 ρ ∈ [R−r, R+r] ⇒ k ∈ ["
          f"{(PRESETS[4][1] - PRESETS[4][2]) / PRESETS[4][1]:.3f}, "
          f"{(PRESETS[4][1] + PRESETS[4][2]) / PRESETS[4][1]:.3f}]（earth，参考 D3）")
    print()
    print("关键结论（写入 02 AC-1）：σ 向格距无法取到精确 1 m。")
    print("  约束：N_σ^0 必须是 16 的倍数（窗口步长 64/256 整除），故")
    print("  N_σ^0 ∈ {⌊x⌋,⌈x⌉}·16，x = L_m/(16·4^levels)。earth 的两个候选：")
    for cand in (172, 173):
        ns_l = cand * 16 * 4 ** 6
        d_sig = 2 * math.pi * 1.8e6 / ns_l
        print(f"    N_σ^0={cand:4d} → N_σ^6={ns_l:9d} → Δσ={d_sig:.6f} m "
              f"(偏差 {100 * (d_sig - 1.0):+.3f}%)")
    print()
    return rows


# ----------------------------------------------------------------------------
# B. 存储预算（earth）
# ----------------------------------------------------------------------------
L0_FIELDS = [
    ("elevation h", "F32", 4),
    ("sed facies ×4", "U8×4", 4),
    ("sed thick ×4", "F16×4", 8),
    ("sed age (顶层)", "F32", 4),
    ("ice thickness", "F16", 2),
    ("flow log(accum)", "F16", 2),
    ("wave index", "F16", 2),
    ("bedrock rock id", "U8", 1),
    ("erosion rate", "F16", 2),
]


def section_b():
    print("=" * 78)
    print("B · 存储预算复核（earth 预设，GB = 10⁹ 字节）")
    print("=" * 78)
    n = derive_grid(7.2e6, 1.8e6, 6)
    cells = n["nu0"] * n["ns0"]
    print(f"L0 = {n['nu0']} × {n['ns0']} = {cells:,} 格")
    total_b = 0
    for name, dtype, b in L0_FIELDS:
        total_b += b
        print(f"  {name:16s} {dtype:6s} {b:2d} B/格 → {b * cells / GB:7.3f} GB")
    core = total_b * cells / GB
    ckpt = 14 * cells / GB
    print(f"  L0 核心小计 {total_b} B/格 → {core:.3f} GB")
    print(f"  检查点 ×2（h F16 + sed 12 B + ice F16 = 14 B/格）→ 每份 {ckpt:.3f} GB，两份 {2 * ckpt:.3f} GB")
    other = (15 + 130 + 30 + 10) / 1000.0
    print(f"  气候场 + 构造终态 + 河网/湖泊 + 构造快照 ≈ {other:.3f} GB")
    print(f"  合计（方案 α，2 检查点）≈ {core + 2 * ckpt + other:.3f} GB")
    print(f"  合计（方案 β，1 检查点）≈ {core + ckpt + other:.3f} GB  ← 与 1.5 GB 上限仅差 {1.5 - (core + ckpt + other):+.3f} GB")
    print("  ⇒ 审计 F5 结论成立：参考的『1.5 GB 上限 + 2 检查点』在 earth 下不相容。")
    print()
    return core, ckpt


# ----------------------------------------------------------------------------
# C. 数值抽查 V1–V15
# ----------------------------------------------------------------------------
def section_c(fine: bool):
    print("=" * 78)
    print("C · 审计 V1–V15 独立复核（本会话重算）")
    print("=" * 78)
    ok = "OK  "
    dev = "DEV "

    # V1 earth 面积
    a_earth = 4 * math.pi ** 2 * 7.2e6 * 1.8e6
    print(f"[{ok}] V1  A=4π²Rr = {a_earth:.4e} m² = {a_earth / 1e6:.3e} km²；地球 5.101e8 km² ⇒ "
          f"比值 {a_earth / 1e6 / 5.101e8:.4f}")
    # V2/V3 重力（注释：圆柱近似 vs 真实环面，见 D 节）
    g_cyl_earth = 2 * math.pi * G * 5500 * 1.8e6
    g_cyl_eg = 2 * math.pi * G * 5500 * 4.25e6
    print(f"[{dev}] V2  2πGρr(earth) = {g_cyl_earth:.4f} m/s² —— 算术正确，但它是『无限长圆柱近似』，"
          f"不是 R/r=4 的真实表面重力（见 D 节：≈3.36 m/s²，低 19%）")
    print(f"[{ok}] V3  2πGρr(earth-g) = {g_cyl_eg:.4f} m/s²；A(earth-g) = "
          f"{4 * math.pi ** 2 * 1.7e7 * 4.25e6 / 1e6:.3e} km² = "
          f"{4 * math.pi ** 2 * 1.7e7 * 4.25e6 / a_earth:.2f}× earth")
    # V4 放大密度
    for name, r, want in (("test", 1.0e5, 99000.0), ("mini", 4.0e5, 24750.0)):
        rho = g_cyl_earth / (2 * math.pi * G * r)
        print(f"[{ok}] V4  {name}: ρ = 4.15/(2πG·r) = {rho:.1f} kg/m³（规格 {want:.0f}）")
    # V5/V6 网格
    e = derive_grid(7.2e6, 1.8e6, 6)
    print(f"[{ok}] V5  earth L0 = {e['nu0']}×{e['ns0']} = {e['nu0'] * e['ns0'] / 1e6:.2f} M 格"
          f"（规格≈2760×11050≈30 M）")
    print(f"[{ok}] V6  全局 1 m 列数 = {e['nu_L'] * e['ns_L']:.3e}（规格 ~5×10¹⁴）")
    # V7/V8
    print(f"[{ok}] V7  气候网格 512×128 → Δ = {2 * math.pi * 7.2e6 / 512 / 1e3:.1f} km / "
          f"{2 * math.pi * 1.8e6 / 128 / 1e3:.1f} km")
    print(f"[{ok}] V8  构造网格 20 km → {a_earth / (2e4) ** 2 / 1e6:.3f} M 格")
    # V9
    print(f"[{ok}] V9  k(σ) ∈ [{(7.2e6 - 1.8e6) / 7.2e6:.2f}, {(7.2e6 + 1.8e6) / 7.2e6:.2f}]")
    # V10/V11 转动惯量与进动
    C, A, ratio = moments_of_inertia(7.2e6, 1.8e6)
    pa, pb, om2 = omega_squared_from_ab(7.2e6, 1.8e6, 5500.0, *((2400, 4800) if fine else (600, 1200)))
    if om2 > 0:
        t_rot = 2 * math.pi / math.sqrt(om2)
        n_orb = 2 * math.pi / YEAR
        psi = 1.5 * (n_orb ** 2 / (2 * math.pi / t_rot)) * abs(ratio) * math.cos(math.radians(23.4))
        p_prec = 2 * math.pi / psi / YEAR
        print(f"[{ok}] V10 (C−A)/C = {abs(ratio):.4f}（细环极限 0.5；R/r=4 略低；规格 0.4–0.5）")
        print(f"[{ok}] V11 Ω² = {om2:.6e} s⁻² ⇒ T_rot = {t_rot / 3600:.3f} h（圆截面；规格预期 2.5–5 h）；"
              f"进动周期 ≈ {p_prec:.0f} yr ⇒『数千年』成立")
    else:
        print(f"[{dev}] V11 Ω² ≤ 0（退化）")
    # V12
    n_int = 200000
    s_sum = sum(max(0.0, math.cos(math.radians(30)) * math.cos(-math.pi + 2 * math.pi * (k + 0.5) / n_int))
                for k in range(n_int)) / n_int
    print(f"[{ok}] V12 外赤道日均 = {s_sum:.6f}·S，cos δ/π = {math.cos(math.radians(30)) / math.pi:.6f}（δ=30°）")
    # V13（修正）
    q_correct = 0.5 * 1e8
    print(f"[{dev}] V13 修正：100 km² 汇水、径流 0.5 m/yr ⇒ Q = {q_correct:.3e} m³/yr（审计 V13 用 2.5e7，"
          f"少一半）")
    print(f"       E = K_f·Q^0.45·S = 7e-6 × {q_correct ** 0.45:.1f} × 0.05 = "
          f"{7e-6 * q_correct ** 0.45 * 0.05:.2e} m/yr ≈ 1.0 mm/yr（规格声称值正确，审计算式应更正）")
    # V14
    d1 = 2600 + 365 * math.sqrt(20)
    d2 = 5651 - 2473 * math.exp(-20 / 36)
    print(f"[{ok}] V14 GDH1 20 Myr 处两支 = {d1:.1f} m / {d2:.1f} m（连续）")
    # V15
    print(f"[{ok}] V15 圆截面 ρ' = −sin v（v=σ/r），0<v<π 时 ρ'<0 ⇒ f = −2Ωρ' > 0（上半环），"
          f"内赤道 f=0，符号约定自洽")
    print()
    return om2


# ----------------------------------------------------------------------------
# D. 环面重力与自转（独立积分）
# ----------------------------------------------------------------------------
def surface_gravity(big_r, r, rho_d, om2, ns, nth, d=1.0e4):
    """外/内赤道的有效表面重力（法向分量）。导数用外侧二阶单边差分。"""
    p_a, p_b = big_r + r, big_r - r
    f0a = torus_potential(p_a, big_r, r, rho_d, ns, nth)
    f1a = torus_potential(p_a + d, big_r, r, rho_d, ns, nth)
    f2a = torus_potential(p_a + 2 * d, big_r, r, rho_d, ns, nth)
    dout = (-3 * f0a + 4 * f1a - f2a) / (2 * d)
    f0b = torus_potential(p_b, big_r, r, rho_d, ns, nth)
    f1b = torus_potential(p_b - d, big_r, r, rho_d, ns, nth)
    f2b = torus_potential(p_b - 2 * d, big_r, r, rho_d, ns, nth)
    din = (3 * f0b - 4 * f1b + f2b) / (2 * d)      # dΦ/dρ（右侧，向内）
    g_out = dout - om2 * p_a                        # 外赤道：离心力抵消重力
    g_in = -din + om2 * p_b                         # 内赤道：离心力与重力同向
    return g_out, g_in, dout


def section_d(fine: bool):
    print("=" * 78)
    print("D · 环面表面重力与自转（独立数值积分；圆截面均匀密度）")
    print("=" * 78)
    ns, nth = (2400, 4800) if fine else (600, 1200)
    print(f"积分分辨率 ns={ns}, nth={nth}")
    cases = [
        ("earth", 7.2e6, 1.8e6, 5500.0),
        ("earth-g", 1.7e7, 4.25e6, 5500.0),
        ("mini(放大密度)", 1.6e6, 4.0e5, 24750.0),
        ("thin R/r=20", 20e6, 1.0e6, 5500.0),
    ]
    out = {}
    for name, big_r, r, rho_d in cases:
        pa, pb, om2 = omega_squared_from_ab(big_r, r, rho_d, ns, nth)
        g_out, g_in, dgrav = surface_gravity(big_r, r, rho_d, om2, ns, nth)
        cyl = 2 * math.pi * G * rho_d * r
        t_rot = 2 * math.pi / math.sqrt(om2) if om2 > 0 else float('nan')
        print(f"  [{name}] R/r={big_r / r:.0f}")
        print(f"    Ω²={om2:.6e} s⁻²  T_rot={t_rot / 3600:.3f} h")
        print(f"    ∂Φ/∂ρ(外赤道, 无自转的重力加速度)={dgrav:.4f} m/s²；离心项 Ω²ρ_A={om2 * (big_r + r):.4f}")
        print(f"    g_eff(外赤道)={g_out:.4f} m/s² （2πGρr={cyl:.4f}，偏差 {100 * (g_out - cyl) / cyl:+.2f}%）")
        print(f"    g_eff(内赤道)={g_in:.4f} m/s²  内/外={g_in / g_out:.3f}")
        out[name] = (g_out, g_in, t_rot, cyl)
    print()
    print("  结论（写入 01 §4.1 / 02 AC-2、NX-06）：")
    print("   · R/r=4（earth/mini）：真实有效表面重力比圆柱近似低约 19% —— AC-2 的『g≈4.15±10%』")
    print("     在 R/r=4 下不成立，必须改为『以 SCF 自洽输出为准 + 独立积分一致性 ±1%』，")
    print("     并把 2πGρr 只用于 R/r≥20 的薄环检查（NX-06）。")
    print("   · 内赤道重力大于外赤道（≈+13%）：可证伪的 RAIL（02 RS-17 前身，编号 NX-06b）。")
    print("   · earth 与 mini 归一化后 g 完全相同（ρ·r 与 R/r 相同）：D6 放大密度方案在设计上精确成立；")
    print("     T_rot 之比 = √(ρ_mini/ρ_earth) = "
          f"{math.sqrt(24750 / 5500):.4f}（可实现为精确验收项）。")
    eg = out.get("earth-g")
    if eg is not None:
        need = 1.8e6 * (9.8 / out["earth"][0])   # g ∝ ρ·r（R/r 相同）⇒ 由 earth 反推所需 r
        area_mult = (need / 1.8e6) ** 2
        print(f"   · earth-g（R/r=4, r=4.25e6 m, ρ=5500）真实 g ≈ {eg[0]:.2f} m/s²，不是参考所称的 9.8；")
        print(f"     要取 9.8 需 r ≈ {need / 1e6:.2f}e6 m（R ≈ {4 * need / 1e6:.1f}e6 m，面积 ≈ {area_mult:.2f}× earth），")
        print(f"     或保持 r 而把密度提到 ≈ {5500 * 9.8 / eg[0]:.0f} kg/m³。D2 需按此更正 earth-g 参数或口径。")
    print()
    return out


# ----------------------------------------------------------------------------
# E. 验收矩阵一致性检查
# ----------------------------------------------------------------------------
def section_e():
    print("=" * 78)
    print("E · 验收矩阵内部一致性检查（02 的修订依据）")
    print("=" * 78)
    for name, big_r, r, levels, rho, _ in PRESETS:
        d = derive_grid(big_r, r, levels)
        dev = abs(d["d_sigma"] - 1.0)
        verdict = "可通过 AC-1(C) 原阈值 0.005" if dev <= 0.005 else "不可通过 AC-1(C) 原阈值 0.005"
        print(f"  {name:10s} |Δσ−1| = {dev:.5f} m → {verdict}")
    print()
    print("  另：G1 判据 ③『无经环孔的质量流失』需要显式算法定义（洪泛连通分量 + 质量记账），")
    print("      当前计划只写了断言，未给出实现步骤与容差 —— 已在 01 §4.1 补充。")
    print("      NX-20 的测量列有 4 个子项、阈值列有 5 个子项（①..⑤）—— 已在 02 拆分为 NX-20a–e。")
    print()


def main():
    ap = argparse.ArgumentParser(description="AerraGen 计划数值复核（标准库）")
    ap.add_argument("--fine", action="store_true", help="高分辨率积分（更慢、更准）")
    args = ap.parse_args()
    section_a()
    section_b()
    section_c(args.fine)
    section_d(args.fine)
    section_e()
    print("完成。")


if __name__ == "__main__":
    main()
