下面以 Nanking Atlas（金陵风物志） 为正式项目名称，整理一份可以直接用于立项、产品设计、AI 辅助开发、任务拆分和工程落地的完整需求与技术实现文档。

这不是单纯的南京旅游网站，而是一个以南京为主题的城市文化数字档案与互动地图平台：通过文章保存历史，通过地图连接街巷，通过人物、建筑、传统和日常生活呈现南京的城市记忆。

# Nanking Atlas（金陵风物志）

![2024南京城墙台城景区门票价格+优惠政策+预约网址+登城路线\_大河票务网](https://images.openai.com/static-rsc-4/CVDSh1bgveOUUGGfnDU1K2T_F_y8pGzdPRt7gj0HCtjzm8qIP3ZMa7gJLeiAUzNmE6X6hpOfnsjUYED7LZ9taMHCCYrxwxDheTBVRaoF31_ePt8E3J0bvAeWJyol5_kW_uCDbVPq7K8tA6WqtcwEXV6376vAl_RgTeP6rJg-Ik4?purpose=inline)

Add to Favorites

![Republic time](https://images.openai.com/static-rsc-4/Rufghx8UVyskkb9bAod7NCeVKN3XDASIdgfVYdWiFq-E1CXWf4BSdbqn0ozBigNpQRN1BHfdljWZL7aofHO_PPPSjyVOpfoMP7EHVBhx6YcUs9q-u2pGiN5SJzVeR65exurrDC4EAY5t6wU2s7DTWV106QcVKKcjswfkcGTn0OqcCrVPCW0cbW8FOD93acJn?purpose=inline)

Add to Favorites

![南京 歴史都市 完全観光ガイド | WaysChina](https://images.openai.com/static-rsc-4/yG-IR9lxmcdyKyDmD9NxT8tRzmJYRt6Cws4lbpRS45BClZo9TsOO5zI0htcddADCm2L9T6AIIxWaCodiRYNkx40O0v1ubwpbFmzyZiDil7T7EO3oaah8b3T0ved947SYilZmgWW5Oe53M0yoISmPVcFBO70eG5I52qYop0HH5Js?purpose=inline)

12

Add to Favorites

产品定位：南京城市文化数字档案 · 互动街巷地图 · 金陵生活记录

## 项目基本信息

中文名称

金陵风物志

英文名称

Nanking Atlas

产品形态

公开文化网站 + 独立内容管理后台 + API 服务

首期部署

前端 Netlify，后端独立部署

品牌副标题

A Cultural Atlas of Nanjing

品牌口号

以地图记录街巷，以文字留存历史，以故事呈现城市生活。

## 1. 产品愿景与建设目标

### 1.1 产品定位

Nanking Atlas 面向对南京历史、建筑、街巷、人物、民俗、城市变迁及本地生活感兴趣的公众，建立一个有来源、有地理位置、有历史脉络、有编辑审核机制的城市文化内容平台。

它综合三种产品形态：

![Picture taken in the 30s of Nanjing (or Nanking),](https://images.openai.com/static-rsc-4/_MMQ1UTFLnDVbublbgBg8HR2CztX9xM2Dfq6fIlw6Orzf-1irWlJ_2tEGJJKsHR3A7UYQuhRw606NgOlBEZEea8JBeWTcx8Tc5esA4S6xCVq9OQSlDLu7tYPpb7kErg6NJy2Ad2UbVnfaQPTlJWog84lMiMig3w8TUdHVvUxhhBqbA1yI7_3816x236IJgw5?purpose=inline)

Add to Favorites

A. 南京城市文化志

Nanjing Cultural Chronicle

以专题文章、历史时间线、人物档案、建筑档案、城市事件为主，建立可持续扩充的南京文化知识库。

![Nanjing Yihe Road autumn](https://images.openai.com/static-rsc-4/o8gzvSvf5Zi-CuR320sPgBEG4AL16QRfYgEvi8F9lsmlgowh8FKDZeb8lFconzkxeHqiLC7eTM_GjdmJGjHkcU_TGzO1bNhfCPzIPECG93E9Ki8gh8W4V8Jo-KasX_isiotwheVLQL9py-rczvP1p0jIkUzie4LmXZ3TUjtFD-zoFnwT-DDbDdbmUp5lpdTD?purpose=inline)

Add to Favorites

B. 南京街巷地图

Nanjing Street Atlas

将街巷、建筑、遗址、历史事件和人物关联到地图，让用户从地理位置进入城市历史。

![南京の超ローカルストリートでグルメ散策👣【三七八巷】｜小羊（シャオヤン）@中国情報](https://images.openai.com/static-rsc-4/OeQav00mXI7QTO2-Isj1nr77nFGu1NvdgEzZOH4LRV0bPBmc-e5pTgo4E_PKWoa8mF1zuAZn2xU10Uj9gUIPbdvlXxXb5zEAvVXuCkkn_idFFcVALQqjD_kEekLAWRiqm69yu7LgNin07oZLSRYHjf5hAhqNvpe62FSxgPzNz48?purpose=inline)

Add to Favorites

C. 金陵生活录

Jinling Living

记录饮食、节庆、方言、行业、社区记忆、老店和当代南京人的生活故事。

### 1.2 建设目标

* 建立独立于社交媒体的南京文化内容档案。

* 让文章、地点、人物、历史事件、图片与地图形成关联。

* 提供适合桌面和手机浏览的现代文化杂志式体验。

* 让非技术编辑能够通过后台完成内容编写、审核、发布与维护。

* 保留可靠的来源、版权信息和事实核查记录。

* 采用模块化技术架构，为未来扩展全文搜索、英文内容、AI 辅助研究和公众投稿预留接口。

### 1.3 首期不做什么

MVP（最小可行产品）暂不实现复杂用户社区、实时聊天、社交关注体系、付费会员、自动化 AI 内容发布、原生移动端应用和大规模知识图谱。

AI 可以协助编辑整理资料，但不能在没有核查的情况下自动发布历史事实。

## 2. 用户角色与使用场景

| 用户角色  | 核心需求         | 主要操作             |
| ----- | ------------ | ---------------- |
| 普通读者  | 了解南京历史与文化    | 阅读文章、浏览地图、查看专题   |
| 城市探索者 | 发现值得走访的街巷与地点 | 地图筛选、查看地点、浏览路线   |
| 文化研究者 | 查阅资料来源和历史关联  | 阅读档案、核对引用、追溯来源   |
| 内容编辑  | 持续生产和维护内容    | 创建文章、管理图片、关联地点   |
| 审核人员  | 控制内容准确性与版权风险 | 核查来源、退回修改、审核发布   |
| 系统管理员 | 维护账号、权限和系统运行 | 管理用户、配置系统、查看审计日志 |

### 典型用户旅程

1. 用户通过搜索引擎进入一篇南京历史街巷文章。

2. 在文章中看到关联地点，点击进入地点详情。

3. 在地图中查看地点所在位置、周边文化档案。

4. 继续浏览相关人物、建筑或历史事件。

5. 打开一条文化探索路线，将多个地点串联起来。

整个体验的核心不是简单增加页面，而是让内容之间形成可探索的关联。

## 3. 产品信息架构与页面需求

### 3.1 网站整体结构

公开网站与管理后台独立开发、独立部署，但共享同一套 API、内容数据和权限规则。

### Nanking Atlas · 公开网站

Next.js · React · TypeScript · Tailwind CSS

首页 / 文化志 / 街巷地图 / 生活录 / 专题 / 搜索 / 详情页

### 统一 API 服务

NestJS · REST API · 身份认证 · 内容服务 · 地理空间查询

PostgreSQL + PostGIS

内容、关联、地理坐标

对象存储

图片、封面、媒体文件

### 独立内容管理后台

React · Vite · TypeScript · shadcn/ui

文章编辑 / 档案管理 / 地图维护 / 审核发布 / 用户权限 / 审计日志

### 3.2 公开网站页面清单

| 页面      | 路由建议                   | 核心功能                |
| ------- | ---------------------- | ------------------- |
| 首页      | `/`                    | 品牌展示、精选专题、最新文章、地图入口 |
| 南京城市文化志 | `/chronicle`           | 历史文章、人物、建筑、时间线      |
| 文章详情    | `/chronicle/[slug]`    | 正文、目录、来源、关联地点       |
| 南京街巷地图  | `/map`                 | 地图、类别筛选、地点卡片        |
| 地点详情    | `/places/[slug]`       | 地点介绍、坐标、历史沿革、关联内容   |
| 金陵生活录   | `/living`              | 街头生活、饮食、民俗、社区故事     |
| 人物档案    | `/people/[slug]`       | 人物简介、生平、关联事件        |
| 建筑档案    | `/architecture/[slug]` | 建筑历史、现状、图片、位置       |
| 历史事件    | `/events/[slug]`       | 时间、背景、相关人物和地点       |
| 专题集合    | `/topics/[slug]`       | 跨文章、人物、地点的专题内容      |
| 城市探索路线  | `/routes/[slug]`       | 路线介绍、站点顺序、地图展示      |
| 搜索      | `/search?q=`           | 文章、地点、人物等统一检索       |
| 关于本站    | `/about`               | 建站目的、编辑原则、资料与版权说明   |
| 来源说明    | `/sources`             | 来源类型、引用规范、纠错方式      |

建议首期优先完成首页、文章列表与详情、地点列表与详情、地图、生活录、专题和搜索。人物、事件、建筑可以复用统一档案模板，避免开发多套相似页面。

### 3.3 首页需求

首页采用文化杂志式布局，而不是传统政务门户或旅游攻略聚合页。

1. 顶部导航：品牌标识、三大栏目、地图入口、搜索按钮。

2. 主视觉区域：南京主题图片、主标题、品牌口号。

3. 编辑精选：2—4 篇重点文章，突出封面、标题和摘要。

4. 从地图认识南京：展示地图入口和若干代表性地点。

5. 城市文化志：历史、人物、建筑等内容分区。

6. 金陵生活录：饮食、民俗、老店、社区故事。

7. 专题策展：如城墙、秦淮河、民国建筑、南京城市变迁。

8. 页脚：关于、版权、内容纠错、联系方式、隐私政策。

首页内容应由后台配置，避免每次调整精选文章都需要修改代码。

### 3.4 地图页面需求

地图是项目的核心差异化功能之一。

![144 Vanderbilt - made with Sanity.io](https://images.openai.com/static-rsc-4/zdgPUb2cAUubu7OrlmERE_cDOkBlsxuQrWNBemrsQOM_jUyWdCRKif8GVuMQiBOv5DQFxFoYcrYScN0JM_xaZmnvOFFZnYyNTthswDmxXYTBpZPOU6RPjIJadvTRvDzap8PJO8qe9szTHEWuuF35zbezZBFcO7SH3c5no1pHf8M?purpose=inline)

Add to Favorites

![Gouda Tijdmachine ontvangt subsidie voor ontwikkeling innovatieve publieksviewer – Gouda Tijdmachine](https://images.openai.com/static-rsc-4/5WzQzPERZWhCJ0LNv5XUD1UHFw6upUmCnohCi6KdB3RLYhi9xEABTyRcs-k2UBGdwTlvFgcUIMT1hv7u664yKOsBE-1GuyFe4lQpnnWiNs0NJp_hMqZELHDb-ka0N6B4eRXq9__dm4s65Z1lZlQ8prXbjV8tvAM1_clWyW2_AHM?purpose=inline)

Add to Favorites

![一日新莊散步指南！新莊微型藝術街區計畫：藝術家蔡浚勝繪製，以插畫地圖串連 15 個新莊景點 | ShoppingDesign](https://images.openai.com/static-rsc-4/I4OTS4ugRrvEKtszjKPlDWJTOQE2KOaqK1NuW_SJHSthIbMCcbkpdiDRv3mtPvG_HNjGkgZBajpmzxdTLvPsSEauvG5QkqiwE1ckkuQZxL08KNtbJy71k7sfPEMqzNnw431-Tl32pMyKY-SNrhXM1juUJZrHgwKmuG6t2s1RI8Q?purpose=inline)

14

Add to Favorites

功能要求：

* 展示已发布且具有有效坐标的地点。

* 支持按地点类型筛选，例如历史建筑、街巷、遗址、博物馆、老店。

* 支持地图标记与列表卡片联动。

* 点击标记后展示地点名称、缩略图、简短介绍及详情链接。

* 支持地图移动、缩放、移动端手势操作。

* 支持关键词搜索与当前地图范围内的地点查询。

* 支持从地点详情跳转至关联文章和专题。

* 对缺少坐标或位置尚未核实的地点，不显示精确地图标记。

* 地图加载失败时，仍能使用地点列表访问内容。

MVP 不需要自研地图引擎。使用 Leaflet 接入符合项目部署地区和使用条款的地图服务即可。地图底图服务、地图数据、地理编码和路线导航是不同能力，不能假定安装 Leaflet 后就全部具备。

### 3.5 文章详情页需求

* 标题、副标题、摘要、封面、作者、发布日期和更新时间。

* 文章目录与标题锚点。

* 正文支持段落、标题、图片、图注、引用、列表、表格和外部链接。

* 展示参考来源和资料说明。

* 展示关联地点、人物、事件、建筑、专题。

* 显示版权声明、摄影者或图片来源。

* 提供内容纠错入口。

* 提供相关内容推荐。

* 支持 SEO 元信息、Open Graph 分享信息与规范 URL。

历史内容需明确区分“史料记载”“学界观点”“民间传说”和“编辑推断”，避免把传说写成已证实事实。

## 4. 内容体系与数据规范

### 4.1 内容模型

不建议为每种内容创建完全独立、重复的文章系统。采用“统一内容实体 + 类型专属字段 + 关联关系”的模型。

| 实体        | 用途      | 示例字段             |
| --------- | ------- | ---------------- |
| Article   | 文章      | 标题、正文、摘要、栏目      |
| Place     | 地点      | 名称、坐标、地址、历史时期    |
| Person    | 人物      | 姓名、生卒、人物简介       |
| Event     | 历史事件    | 起止时间、事件背景        |
| Tradition | 民俗与传统   | 类型、传承方式、相关时期     |
| Route     | 城市探索路线  | 介绍、路线顺序、预计时长     |
| Topic     | 专题      | 标题、封面、编者按        |
| Media     | 图片及其他媒体 | 文件地址、作者、版权、拍摄时间  |
| Source    | 资料来源    | 名称、URL、出版信息、访问日期 |
| Tag       | 标签      | 名称、别名、类别         |

### 4.2 关联关系

内容之间应当建立可查询的关系，例如：

* 文章 ↔ 地点：文章讲述某地点的历史。

* 人物 ↔ 事件：人物参与或见证某事件。

* 地点 ↔ 建筑：地点内存在特定建筑。

* 文章 ↔ 来源：文章引用特定史料。

* 地点 ↔ 路线：地点是某条路线的站点。

* 内容 ↔ 专题：内容被策展人加入专题。

* 内容 ↔ 媒体：内容使用相关图片或档案材料。

关联关系建议统一存储在 `content_relations` 表中，并记录关系类型、方向和说明。高频、需要特殊约束的关系可以在后续按实际查询需求拆分为专用表。

### 4.3 内容质量与审核规则

每条重要文化内容应具备：

* 唯一标识和稳定 URL。

* 内容类型、标题、摘要和正文。

* 编辑人员、审核人员、发布时间和修改时间。

* 至少一项来源说明，或明确标记为原创采访、个人观察等其他内容类型。

* 图片版权与授权状态。

* 必要时记录地理位置的精度和核实状态。

* 历史争议、时间不确定或存在不同说法时的编辑注释。

内容状态建议为：

`draft → in_review → approved → published → archived`

其中，审核退回应有明确原因；发布、撤回和归档必须记录操作者与时间。普通编辑不能通过前端参数直接绕过审核。

### 4.4 示例内容

以下为结构示意，正式上线前应由编辑核对史实、坐标和授权。

内容：南京明城墙

![Ancient city walls in Nanjing, China](https://images.openai.com/static-rsc-4/eR2TxeOhCRtQonSOVxU0ZbnARB0Ja306z5lIr7iYxWwwKZUX-j9Uz6SqUvfEIekAOTIKXKNxKv7GbZfW1HtKRxfqhChfikI8ajpZR9bG8ThcEA82bmuAGIu3wtTBiZtk4-FNEjLblaeY2KOFzCLBcUJeG0Qfcj7CCbUVLtdl7WsW1yH6w9zORy2bqCE4hPrA?purpose=inline)

Add to Favorites

类型：地点 / 建筑档案

关联内容

* 南京城市历史专题

* 明代都城建设

* 南京城市空间变迁

  来源状态：待编辑核验（示例）

## 5. 视觉设计系统

### 5.1 设计方向

关键词：现代东方文化、编辑部美学、城市档案、纸张质感、克制的动效。

不采用过度仿古的卷轴界面、密集的信息卡片、繁复的金色装饰或满屏水墨背景。文化感主要通过字体、排版、图片、留白和内容结构体现。

### 5.2 色彩规范

纸白

#F7F4EC

松墨绿

#263C32

古铜棕

#956B45

朱砂红

#A64F3C

墨色

#292923

### 5.3 字体与排版

* 中文标题：Noto Serif SC。

* 正文与后台界面：Noto Sans SC。

* 英文标题：优先选择与中文宋体气质协调的衬线字体。

* 正文行高建议为 1.7—1.9，正文宽度控制在舒适阅读范围内。

* 文章封面采用统一比例，图片说明与摄影来源独立显示。

* 颜色对比、键盘焦点、图片替代文本需要满足基本无障碍要求。

字体优先使用合法、稳定的托管方式。对中国大陆用户，需要考虑 Google Fonts 等第三方字体资源可能无法稳定加载的情况，建议自托管合规字体文件或提供系统字体回退。

### 5.4 动效与交互

* 使用 Motion for React 实现轻量的入场动画、卡片过渡和地图面板动画。

* 使用 CSS transitions 实现按钮、链接和焦点反馈。

* 动效不应阻塞正文阅读或影响页面加载。

* 支持 `prefers-reduced-motion`，尊重用户的减少动态效果设置。

* 地图移动、弹窗和页面滚动不应互相抢夺控制权。

## 6. 技术选型与总体架构

### 6.1 技术栈

| 层级       | 技术                                | 选择理由            |
| -------- | --------------------------------- | --------------- |
| 公开网站     | Next.js + React + TypeScript      | SEO、服务端渲染、静态生成  |
| 管理后台     | React + Vite + TypeScript         | 独立构建、开发效率高      |
| 样式系统     | Tailwind CSS                      | 统一设计规范、快速布局     |
| UI 组件    | shadcn/ui                         | 组件可控、便于主题定制     |
| 动效       | Motion for React + CSS            | 轻量交互和过渡动画       |
| 图标       | Lucide React                      | 风格统一、开源         |
| 地图       | Leaflet                           | 轻量、可扩展的交互地图     |
| 富文本编辑    | Tiptap                            | 自定义文章编辑能力       |
| 表格       | TanStack Table                    | 后台内容表格和筛选       |
| 服务端      | NestJS + TypeScript               | 模块化 API、权限与业务分层 |
| 数据库      | PostgreSQL                        | 关系型内容数据与事务      |
| 空间数据     | PostGIS                           | 地理查询、距离筛选、空间索引  |
| ORM      | Prisma                            | 类型安全的数据访问与迁移    |
| 文件存储     | S3 兼容对象存储                         | 图片和媒体与应用服务解耦    |
| 包管理      | pnpm                              | 工作区管理、依赖复用      |
| Monorepo | Turborepo                         | 统一构建与任务编排       |
| 测试       | Vitest、Playwright、API 集成测试        | 单元、端到端及接口验证     |
| 代码规范     | ESLint、Prettier、TypeScript strict | 统一质量标准          |
| CI/CD    | GitHub Actions                    | 自动检查、构建与部署      |

重要取舍： 公开网站和后台应独立部署，但首期不必拆分为多个微服务。使用模块化单体 API 更容易开发、部署、调试和控制成本。

### 6.2 系统架构

Diagram options

![](data\:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_3op_%22%20width%3D%221198.7200927734375%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20class%3D%22flowchart%22%20height%3D%22565.1407470703125%22%20viewBox%3D%224%204%201198.7200927734375%20565.1407470703125%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22flowchart-v2%22%3E%3Cstyle%3E%23mermaid-_r_3op_%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_3op_%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_3op_%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_3op_%20.error-icon%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_3op_%20.error-text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_3op_%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_3op_%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_3op_%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_3op_%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_3op_%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_3op_%20.marker%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3op_%20.marker.cross%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3op_%20svg%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3B%7D%23mermaid-_r_3op_%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_3op_%20.label%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20.cluster-label%20text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20.cluster-label%20span%7Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20.cluster-label%20span%20p%7Bbackground-color%3Atransparent%3B%7D%23mermaid-_r_3op_%20.label%20text%2C%23mermaid-_r_3op_%20span%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20.node%20rect%2C%23mermaid-_r_3op_%20.node%20circle%2C%23mermaid-_r_3op_%20.node%20ellipse%2C%23mermaid-_r_3op_%20.node%20polygon%2C%23mermaid-_r_3op_%20.node%20path%7Bfill%3Argb\(222%2C%20234%2C%20251\)%3Bstroke%3Argb\(83%2C%20154%2C%20248\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3op_%20.rough-node%20.label%20text%2C%23mermaid-_r_3op_%20.node%20.label%20text%2C%23mermaid-_r_3op_%20.image-shape%20.label%2C%23mermaid-_r_3op_%20.icon-shape%20.label%7Btext-anchor%3Amiddle%3B%7D%23mermaid-_r_3op_%20.node%20.katex%20path%7Bfill%3A%23000%3Bstroke%3A%23000%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3op_%20.rough-node%20.label%2C%23mermaid-_r_3op_%20.node%20.label%2C%23mermaid-_r_3op_%20.image-shape%20.label%2C%23mermaid-_r_3op_%20.icon-shape%20.label%7Btext-align%3Acenter%3B%7D%23mermaid-_r_3op_%20.node.clickable%7Bcursor%3Apointer%3B%7D%23mermaid-_r_3op_%20.root%20.anchor%20path%7Bfill%3Argb\(93%2C%2093%2C%2093\)!important%3Bstroke-width%3A0%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3op_%20.arrowheadPath%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3op_%20.edgePath%20.path%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bstroke-width%3A2.0px%3B%7D%23mermaid-_r_3op_%20.flowchart-link%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bfill%3Anone%3B%7D%23mermaid-_r_3op_%20.edgeLabel%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Btext-align%3Acenter%3B%7D%23mermaid-_r_3op_%20.edgeLabel%20p%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_3op_%20.edgeLabel%20rect%7Bopacity%3A0.5%3Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_3op_%20.labelBkg%7Bbackground-color%3Argba\(252%2C%20252%2C%20252%2C%200.5\)%3B%7D%23mermaid-_r_3op_%20.cluster%20rect%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.05\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3op_%20.cluster%20text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20.cluster%20span%7Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20div.mermaidTooltip%7Bposition%3Aabsolute%3Btext-align%3Acenter%3Bmax-width%3A200px%3Bpadding%3A2px%3Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A12px%3Bbackground%3Argb\(249%2C%20249%2C%20249\)%3Bborder%3A1px%20solid%20rgba\(0%2C%200%2C%200%2C%200.05\)%3Bborder-radius%3A2px%3Bpointer-events%3Anone%3Bz-index%3A100%3B%7D%23mermaid-_r_3op_%20.flowchartTitleText%7Btext-anchor%3Amiddle%3Bfont-size%3A18px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3op_%20rect.text%7Bfill%3Anone%3Bstroke-width%3A0%3B%7D%23mermaid-_r_3op_%20.icon-shape%2C%23mermaid-_r_3op_%20.image-shape%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Btext-align%3Acenter%3B%7D%23mermaid-_r_3op_%20.icon-shape%20p%2C%23mermaid-_r_3op_%20.image-shape%20p%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bpadding%3A2px%3B%7D%23mermaid-_r_3op_%20.icon-shape%20rect%2C%23mermaid-_r_3op_%20.image-shape%20rect%7Bopacity%3A0.5%3Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_3op_%20.label-icon%7Bdisplay%3Ainline-block%3Bheight%3A1em%3Boverflow%3Avisible%3Bvertical-align%3A-0.125em%3B%7D%23mermaid-_r_3op_%20.node%20.label-icon%20path%7Bfill%3AcurrentColor%3Bstroke%3Arevert%3Bstroke-width%3Arevert%3B%7D%23mermaid-_r_3op_%20.node%20text%7Bfont-size%3A16px%3Bfont-weight%3A600%3Bletter-spacing%3A-0.32px%3Bfill%3A%23004f99%3B%7D%23mermaid-_r_3op_%20.edgeLabels%20text%7Bfont-size%3A13px%3Bfont-weight%3A600%3Bletter-spacing%3A-0.08px%3Bfill%3A%23004f99%3B%7D%23mermaid-_r_3op_%20.node%20tspan%5Bfont-weight%3D%22normal%22%5D%2C%23mermaid-_r_3op_%20.edgeLabels%20tspan%5Bfont-weight%3D%22normal%22%5D%7Bfont-weight%3A600%3B%7D%23mermaid-_r_3op_%20.edgeLabel%20.label%20rect%7Bopacity%3A1%3Brx%3A13px%3Bry%3A13px%3Bfill%3A%23f5faff%3Bstroke%3Argb\(206%2C%20219%2C%20229\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3op_%20.node%20rect%2C%23mermaid-_r_3op_%20.node%20circle%2C%23mermaid-_r_3op_%20.node%20ellipse%2C%23mermaid-_r_3op_%20.node%20polygon%2C%23mermaid-_r_3op_%20.node%20path%7Bfill%3Argb\(229%2C%20243%2C%20255\)%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.1\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3op_%20.node%20rect%7Brx%3A16px%3Bry%3A16px%3B%7D%23mermaid-_r_3op_%20.node.mermaid-decision%20.label-container%7Bfill%3A%23f5faff%3Bstroke%3Argb\(206%2C%20219%2C%20229\)%3Bstroke-dasharray%3A2%202%3B%7D%23mermaid-_r_3op_%20.edgePaths%20.flowchart-link%7Bstroke%3Argb\(206%2C%20219%2C%20229\)%3Bstroke-width%3A1px%3Bstroke-linecap%3Around%3Bstroke-linejoin%3Around%3B%7D%23mermaid-_r_3op_%20.marker%7Bfill%3Argb\(206%2C%20219%2C%20229\)%3Bstroke%3Argb\(206%2C%20219%2C%20229\)%3B%7D%23mermaid-_r_3op_%20.node%7Bcolor-scheme%3Alight%3B%7D%23mermaid-_r_3op_%20%3Aroot%7B--mermaid-font-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3B%7D%3C%2Fstyle%3E%3Cg%3E%3Cmarker%20id%3D%22mermaid-_r_3op__flowchart-v2-pointEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%22-5%20-5%2010%2010%22%20refX%3D%220%22%20refY%3D%220%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2210%22%20markerHeight%3D%2210%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%204%200%20M%200.8180194846605362%20-3.181980515339464%20L%204%200%20L%200.8180194846605362%203.181980515339464%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%20none%3B%20fill%3A%20none%3B%20stroke-linecap%3A%20round%3B%20stroke-linejoin%3A%20round%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3op__flowchart-v2-pointStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%22-5%20-5%2010%2010%22%20refX%3D%220%22%20refY%3D%220%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2210%22%20markerHeight%3D%2210%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%20-4%200%20M%20-0.8180194846605362%20-3.181980515339464%20L%20-4%200%20L%20-0.8180194846605362%203.181980515339464%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%20none%3B%20fill%3A%20none%3B%20stroke-linecap%3A%20round%3B%20stroke-linejoin%3A%20round%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3op__flowchart-v2-circleEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%2211%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3op__flowchart-v2-circleStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%22-1%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3op__flowchart-v2-crossEnd%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%2212%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3op__flowchart-v2-crossStart%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%22-1%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fg%3E%3Cg%20class%3D%22subgraphs%22%3E%3C%2Fg%3E%3Cg%20class%3D%22nodes%22%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Visitor-0%22%20transform%3D%22translate\(885.2139743623279%2C%2042\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-83.04375076293945%22%20y%3D%22-30%22%20width%3D%22166.0875015258789%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%85%AC%E5%BC%80%E7%BD%91%E7%AB%99%E7%94%A8%E6%88%B7%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Web-1%22%20transform%3D%22translate\(885.2139743623279%2C%20142\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-77.9301643371582%22%20y%3D%22-30%22%20width%3D%22155.8603286743164%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ENext.js%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Web%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Editor-2%22%20transform%3D%22translate\(1099.2977374848865%2C%2042\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-91.0400161743164%22%20y%3D%22-30%22%20width%3D%22182.0800323486328%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E7%BC%96%E8%BE%91%E4%B8%8E%E5%AE%A1%E6%A0%B8%E4%BA%BA%E5%91%98%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Admin-3%22%20transform%3D%22translate\(1099.2977374848865%2C%20142\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-80.32500076293945%22%20y%3D%22-30%22%20width%3D%22160.6500015258789%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EReact%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Admin%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-API-5%22%20transform%3D%22translate\(1074.883153642927%2C%20242\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-73.2437515258789%22%20y%3D%22-30%22%20width%3D%22146.4875030517578%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3ENestJS%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20API%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Auth-9%22%20transform%3D%22translate\(103.0400161743164%2C%20422\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-91.0400161743164%22%20y%3D%22-30%22%20width%3D%22182.0800323486328%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E8%AE%A4%E8%AF%81%E4%B8%8E%E6%9D%83%E9%99%90%E6%A8%A1%E5%9D%97%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Content-11%22%20transform%3D%22translate\(325.1200485229492%2C%20422\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-91.0400161743164%22%20y%3D%22-30%22%20width%3D%22182.0800323486328%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%86%85%E5%AE%B9%E4%B8%8E%E5%8F%91%E5%B8%83%E6%A8%A1%E5%9D%97%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Geo-13%22%20transform%3D%22translate\(562.8800811767578%2C%20422\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-106.72002410888672%22%20y%3D%22-30%22%20width%3D%22213.44004821777344%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%9C%B0%E7%82%B9%E4%B8%8E%E7%A9%BA%E9%97%B4%E6%9F%A5%E8%AF%A2%E6%A8%A1%E5%9D%97%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Search-15%22%20transform%3D%22translate\(777.1201019287109%2C%20422\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-67.5200080871582%22%20y%3D%22-30%22%20width%3D%22135.0400161743164%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E6%90%9C%E7%B4%A2%E6%A8%A1%E5%9D%97%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-DB-17%22%20transform%3D%22translate\(562.8800811767578%2C%20526.5703582763672\)%22%3E%3Cpath%20d%3D%22M0%2C10.846903369145345%20a47.89986801147461%2C10.846903369145345%200%2C0%2C0%2095.79973602294922%2C0%20a47.89986801147461%2C10.846903369145345%200%2C0%2C0%20-95.79973602294922%2C0%20l0%2C47.44690375061507%20a47.89986801147461%2C10.846903369145345%200%2C0%2C0%2095.79973602294922%2C0%20l0%2C-47.44690375061507%22%20class%3D%22basic%20label-container%22%20style%3D%22%22%20transform%3D%22translate\(-47.89986801147461%2C%20-34.570355244452884\)%22%3E%3C%2Fpath%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(-0.24361801147460938%2C%200.7999998331069946\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3EPostgreSQL%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Storage-23%22%20transform%3D%22translate\(952.1601104736328%2C%20422\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-67.5200080871582%22%20y%3D%22-30%22%20width%3D%22135.0400161743164%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%AF%B9%E8%B1%A1%E5%AD%98%E5%82%A8%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-Cache-25%22%20transform%3D%22translate\(1127.2001190185547%2C%20422\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-67.5200080871582%22%20y%3D%22-30%22%20width%3D%22135.0400161743164%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%8F%AF%E9%80%89%E7%BC%93%E5%AD%98%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-CDN-27%22%20transform%3D%22translate\(859.2372541881743%2C%20242\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-85.76874923706055%22%20y%3D%22-30%22%20width%3D%22171.5374984741211%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E9%9D%99%E6%80%81%E8%B5%84%E6%BA%90%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20CDN%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edges%20edgePaths%22%3E%3Cpath%20d%3D%22M885.2139743623279%2C72L885.2139743623279%2C100%22%20id%3D%22L_Visitor_Web_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Visitor_Web_0%22%20data-points%3D%22W3sieCI6ODg1LjIxMzk3NDM2MjMyNzksInkiOjcyfSx7IngiOjg4NS4yMTM5NzQzNjIzMjc5LCJ5IjoxMDR9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1099.2977374848865%2C72L1099.2977374848865%2C100%22%20id%3D%22L_Editor_Admin_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Editor_Admin_0%22%20data-points%3D%22W3sieCI6MTA5OS4yOTc3Mzc0ODQ4ODY1LCJ5Ijo3Mn0seyJ4IjoxMDk5LjI5NzczNzQ4NDg4NjUsInkiOjEwNH1d%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M911.1906945364816%2C172L911.1906945364816%2C185.21704397470535Q911.1906945364816%2C187%20912.2764809741085%2C188.4142135623731L912.2764809741085%2C188.4142135623731Q913.3622674117354%2C189.82842712474618%20914.7764809741085%2C190.91421356237308L914.7764809741085%2C190.9142135623731Q916.1906945364816%2C192%20917.9736505617763%2C192L1043.6856137756727%2C192Q1045.4685698009673%2C192%201046.8827833633404%2C193.0857864376269L1046.8827833633404%2C193.08578643762692Q1048.2969969257135%2C194.17157287525382%201049.3827833633404%2C195.5857864376269L1049.3827833633404%2C195.5857864376269Q1050.4685698009673%2C197%201050.4685698009673%2C198.78295602529465L1050.4685698009673%2C202%22%20id%3D%22L_Web_API_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Web_API_0%22%20data-points%3D%22W3sieCI6OTExLjE5MDY5NDUzNjQ4MTYsInkiOjE3Mn0seyJ4Ijo5MTEuMTkwNjk0NTM2NDgxNiwieSI6MTkyfSx7IngiOjEwNTAuNDY4NTY5ODAwOTY3MywieSI6MTkyfSx7IngiOjEwNTAuNDY4NTY5ODAwOTY3MywieSI6MjA2fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1099.2977374848865%2C172L1099.2977374848865%2C200%22%20id%3D%22L_Admin_API_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Admin_API_0%22%20data-points%3D%22W3sieCI6MTA5OS4yOTc3Mzc0ODQ4ODY1LCJ5IjoxNzJ9LHsieCI6MTA5OS4yOTc3Mzc0ODQ4ODY1LCJ5IjoyMDR9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1022.5661882672991%2C272L1022.5661882672991%2C285.21704397470535Q1022.5661882672991%2C287%201021.4804018296722%2C288.4142135623731L1021.4804018296722%2C288.4142135623731Q1020.3946153920454%2C289.8284271247462%201018.9804018296722%2C290.9142135623731L1018.9804018296722%2C290.9142135623731Q1017.5661882672991%2C292%201015.7832322420045%2C292L109.82297219961106%2C292Q108.0400161743164%2C292%20106.62580261194331%2C293.0857864376269L106.62580261194331%2C293.0857864376269Q105.21158904957022%2C294.1715728752538%20104.12580261194333%2C295.5857864376269L104.12580261194331%2C295.5857864376269Q103.0400161743164%2C297%20103.0400161743164%2C298.78295602529465L103.0400161743164%2C380%22%20id%3D%22L_API_Auth_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_API_Auth_0%22%20data-points%3D%22W3sieCI6MTAyMi41NjYxODgyNjcyOTkxLCJ5IjoyNzJ9LHsieCI6MTAyMi41NjYxODgyNjcyOTkxLCJ5IjoyOTJ9LHsieCI6MTAzLjA0MDAxNjE3NDMxNjQsInkiOjI5Mn0seyJ4IjoxMDMuMDQwMDE2MTc0MzE2NCwieSI6Mzg0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1043.4929744175502%2C272L1043.4929744175502%2C305.21704397470535Q1043.4929744175502%2C307%201042.4071879799233%2C308.4142135623731L1042.4071879799233%2C308.4142135623731Q1041.3214015422964%2C309.8284271247462%201039.9071879799233%2C310.9142135623731L1039.9071879799233%2C310.9142135623731Q1038.4929744175502%2C312%201036.7100183922555%2C312L331.90300454824387%2C312Q330.1200485229492%2C312%20328.7058349605761%2C313.0857864376269L328.7058349605761%2C313.0857864376269Q327.291621398203%2C314.1715728752538%20326.2058349605761%2C315.5857864376269L326.2058349605761%2C315.5857864376269Q325.1200485229492%2C317%20325.1200485229492%2C318.78295602529465L325.1200485229492%2C380%22%20id%3D%22L_API_Content_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_API_Content_0%22%20data-points%3D%22W3sieCI6MTA0My40OTI5NzQ0MTc1NTAyLCJ5IjoyNzJ9LHsieCI6MTA0My40OTI5NzQ0MTc1NTAyLCJ5IjozMTJ9LHsieCI6MzI1LjEyMDA0ODUyMjk0OTIsInkiOjMxMn0seyJ4IjozMjUuMTIwMDQ4NTIyOTQ5MiwieSI6Mzg0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1064.4197605678014%2C272L1064.4197605678014%2C325.21704397470535Q1064.4197605678014%2C327%201063.3339741301745%2C328.4142135623731L1063.3339741301745%2C328.4142135623731Q1062.2481876925476%2C329.8284271247462%201060.8339741301745%2C330.9142135623731L1060.8339741301745%2C330.9142135623731Q1059.4197605678014%2C332%201057.6368045425068%2C332L569.6630372020525%2C332Q567.8800811767578%2C332%20566.4658676143847%2C333.0857864376269L566.4658676143847%2C333.0857864376269Q565.0516540520116%2C334.1715728752538%20563.9658676143847%2C335.5857864376269L563.9658676143847%2C335.5857864376269Q562.8800811767578%2C337%20562.8800811767578%2C338.78295602529465L562.8800811767578%2C380%22%20id%3D%22L_API_Geo_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_API_Geo_0%22%20data-points%3D%22W3sieCI6MTA2NC40MTk3NjA1Njc4MDE0LCJ5IjoyNzJ9LHsieCI6MTA2NC40MTk3NjA1Njc4MDE0LCJ5IjozMzJ9LHsieCI6NTYyLjg4MDA4MTE3Njc1NzgsInkiOjMzMn0seyJ4Ijo1NjIuODgwMDgxMTc2NzU3OCwieSI6Mzg0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1085.3465467180524%2C272L1085.3465467180524%2C345.21704397470535Q1085.3465467180524%2C347%201084.2607602804255%2C348.4142135623731L1084.2607602804255%2C348.4142135623731Q1083.1749738427986%2C349.8284271247462%201081.7607602804255%2C350.9142135623731L1081.7607602804255%2C350.9142135623731Q1080.3465467180524%2C352%201078.5635906927578%2C352L783.9030579540056%2C352Q782.1201019287109%2C352%20780.7058883663378%2C353.0857864376269L780.7058883663378%2C353.0857864376269Q779.2916748039647%2C354.1715728752538%20778.2058883663378%2C355.5857864376269L778.2058883663378%2C355.5857864376269Q777.1201019287109%2C357%20777.1201019287109%2C358.78295602529465L777.1201019287109%2C380%22%20id%3D%22L_API_Search_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_API_Search_0%22%20data-points%3D%22W3sieCI6MTA4NS4zNDY1NDY3MTgwNTI0LCJ5IjoyNzJ9LHsieCI6MTA4NS4zNDY1NDY3MTgwNTI0LCJ5IjozNTJ9LHsieCI6Nzc3LjEyMDEwMTkyODcxMDksInkiOjM1Mn0seyJ4Ijo3NzcuMTIwMTAxOTI4NzEwOSwieSI6Mzg0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M325.1200485229492%2C452L325.1200485229492%2C465.21704397470535Q325.1200485229492%2C467%20326.2058349605761%2C468.4142135623731L326.2058349605761%2C468.4142135623731Q327.291621398203%2C469.8284271247462%20328.7058349605761%2C470.9142135623731L328.7058349605761%2C470.9142135623731Q330.1200485229492%2C472%20331.90300454824387%2C472L532.1471911457259%2C472Q533.9301471710205%2C472%20535.3443607333936%2C473.0857864376269L535.3443607333936%2C473.0857864376269Q536.7585742957667%2C474.1715728752538%20537.8443607333936%2C475.5857864376269L537.8443607333936%2C475.5857864376269Q538.9301471710205%2C477%20538.9301471710205%2C478.78295602529465L538.9301471710205%2C482%22%20id%3D%22L_Content_DB_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Content_DB_0%22%20data-points%3D%22W3sieCI6MzI1LjEyMDA0ODUyMjk0OTIsInkiOjQ1Mn0seyJ4IjozMjUuMTIwMDQ4NTIyOTQ5MiwieSI6NDcyfSx7IngiOjUzOC45MzAxNDcxNzEwMjA1LCJ5Ijo0NzJ9LHsieCI6NTM4LjkzMDE0NzE3MTAyMDUsInkiOjQ4Nn1d%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M562.8800811767578%2C452L562.8800811767578%2C480%22%20id%3D%22L_Geo_DB_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Geo_DB_0%22%20data-points%3D%22W3sieCI6NTYyLjg4MDA4MTE3Njc1NzgsInkiOjQ1Mn0seyJ4Ijo1NjIuODgwMDgxMTc2NzU3OCwieSI6NDg0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M777.1201019287109%2C452L777.1201019287109%2C465.21704397470535Q777.1201019287109%2C467%20776.034315491084%2C468.4142135623731L776.034315491084%2C468.4142135623731Q774.9485290534572%2C469.8284271247462%20773.534315491084%2C470.9142135623731L773.534315491084%2C470.9142135623731Q772.1201019287109%2C472%20770.3371459034163%2C472L593.6129712077898%2C472Q591.8300151824951%2C472%20590.415801620122%2C473.0857864376269L590.415801620122%2C473.0857864376269Q589.0015880577489%2C474.1715728752538%20587.915801620122%2C475.5857864376269L587.915801620122%2C475.5857864376269Q586.8300151824951%2C477%20586.8300151824951%2C478.78295602529465L586.8300151824951%2C482%22%20id%3D%22L_Search_DB_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Search_DB_0%22%20data-points%3D%22W3sieCI6Nzc3LjEyMDEwMTkyODcxMDksInkiOjQ1Mn0seyJ4Ijo3NzcuMTIwMTAxOTI4NzEwOSwieSI6NDcyfSx7IngiOjU4Ni44MzAwMTUxODI0OTUxLCJ5Ijo0NzJ9LHsieCI6NTg2LjgzMDAxNTE4MjQ5NTEsInkiOjQ4Nn1d%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1106.2733328683037%2C272L1106.2733328683037%2C365.21704397470535Q1106.2733328683037%2C367%201105.1875464306768%2C368.4142135623731L1105.1875464306768%2C368.4142135623731Q1104.1017599930499%2C369.8284271247462%201102.6875464306768%2C370.9142135623731L1102.6875464306768%2C370.9142135623731Q1101.2733328683037%2C372%201099.490376843009%2C372L958.9430664989275%2C372Q957.1601104736328%2C372%20955.7458969112597%2C373.0857864376269L955.7458969112597%2C373.0857864376269Q954.3316833488866%2C374.1715728752538%20953.2458969112597%2C375.5857864376269L953.2458969112597%2C375.5857864376269Q952.1601104736328%2C377%20952.1601104736328%2C378.78295602529465L952.1601104736328%2C382%22%20id%3D%22L_API_Storage_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_API_Storage_0%22%20data-points%3D%22W3sieCI6MTEwNi4yNzMzMzI4NjgzMDM3LCJ5IjoyNzJ9LHsieCI6MTEwNi4yNzMzMzI4NjgzMDM3LCJ5IjozNzJ9LHsieCI6OTUyLjE2MDExMDQ3MzYzMjgsInkiOjM3Mn0seyJ4Ijo5NTIuMTYwMTEwNDczNjMyOCwieSI6Mzg2fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M1127.2001190185547%2C272L1127.2001190185547%2C380%22%20id%3D%22L_API_Cache_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_API_Cache_0%22%20data-points%3D%22W3sieCI6MTEyNy4yMDAxMTkwMTg1NTQ3LCJ5IjoyNzJ9LHsieCI6MTEyNy4yMDAxMTkwMTg1NTQ3LCJ5IjozODR9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M859.2372541881743%2C172L859.2372541881743%2C200%22%20id%3D%22L_Web_CDN_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_Web_CDN_0%22%20data-points%3D%22W3sieCI6ODU5LjIzNzI1NDE4ODE3NDMsInkiOjE3Mn0seyJ4Ijo4NTkuMjM3MjU0MTg4MTc0MywieSI6MjA0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3op__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabels%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Visitor_Web_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Editor_Admin_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Web_API_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Admin_API_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_API_Auth_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_API_Content_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_API_Geo_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_API_Search_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Content_DB_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Geo_DB_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Search_DB_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_API_Storage_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_API_Cache_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_Web_CDN_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E)

### 6.3 渲染策略

公开网站并非所有页面都需要同一种渲染方式。

* 静态生成（SSG）：首页、栏目介绍、已发布文章、专题和地点详情。

* 按需重新验证（ISR）：发布或更新内容后刷新缓存页面。

* 服务端渲染（SSR）：需要实时结果、个性化或动态参数的页面。

* 客户端交互：地图操作、筛选、弹窗和可交互目录。

建议使用 Next.js App Router。对公开文章和地点页面优先采用静态生成，后台数据变化时通过安全的发布通知触发页面重新验证。不要把管理后台的私密数据预渲染进公开页面。

### 6.4 Netlify 与部署边界

首期公开网站部署 Netlify；后台可单独部署 Netlify；API 与数据库部署在独立服务器或托管服务上。

| 组件          | 建议部署方式        | 说明                         |
| ----------- | ------------- | -------------------------- |
| 公开网站        | Netlify       | Next.js 适配情况以实际构建和当前平台支持为准 |
| 管理后台        | Netlify       | 构建成静态 SPA，单独域名             |
| API         | 容器平台或 VPS     | 运行 NestJS，提供 HTTPS         |
| PostgreSQL  | 托管数据库或独立服务器   | 仅允许 API 所在网络访问             |
| 媒体文件        | 对象存储 + CDN    | 避免把图片直接存进应用容器              |
| DNS / HTTPS | DNS 服务 + 自动证书 | 分别配置 Web、Admin、API         |

建议域名结构：

* `www.example.com`：公开网站

* `admin.example.com`：内容管理后台

* `api.example.com`：后端接口

这些仅为结构示例，正式域名需另行购买并核验可用性。

Netlify 的免费额度、Next.js 功能支持、带宽和构建限制可能随政策变化。项目上线前应重新核对官方套餐与适配文档，不应将“尽量免费”理解为长期无成本保证。

## 7. Monorepo 项目目录

建议仓库名称：`nanking-atlas`。

```
nanking-atlas/
├── apps/
│   ├── web/                       # 公开网站：Next.js
│   │   ├── public/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── page.tsx
│   │       │   ├── chronicle/
│   │       │   ├── map/
│   │       │   ├── living/
│   │       │   ├── places/[slug]/
│   │       │   ├── topics/[slug]/
│   │       │   └── search/
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   ├── editorial/
│   │       │   ├── map/
│   │       │   └── content/
│   │       ├── lib/
│   │       └── styles/
│   ├── admin/                     # 独立管理后台：React + Vite
│   │   └── src/
│   │       ├── app/
│   │       ├── pages/
│   │       ├── components/
│   │       ├── features/
│   │       │   ├── articles/
│   │       │   ├── places/
│   │       │   ├── media/
│   │       │   ├── review/
│   │       │   └── users/
│   │       ├── lib/
│   │       └── routes/
│   └── api/                       # NestJS
│       └── src/
│           ├── auth/
│           ├── users/
│           ├── articles/
│           ├── places/
│           ├── people/
│           ├── events/
│           ├── traditions/
│           ├── routes/
│           ├── topics/
│           ├── media/
│           ├── sources/
│           ├── search/
│           ├── audit/
│           └── common/
├── packages/
│   ├── contracts/                 # API DTO、共享类型、Schema
│   ├── api-client/                # 类型化 API 客户端
│   ├── ui/                        # 允许共享的基础组件
│   ├── config-eslint/
│   └── config-typescript/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── DEPLOYMENT.md
│   └── EDITORIAL_GUIDELINES.md
├── scripts/
├── .github/workflows/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
└── README.md
```

目录中的文件是建议规划，不代表已经创建了可运行仓库。

### 7.1 工程约定

* 全项目启用 TypeScript strict。

* 统一使用 pnpm，不混用 npm、Yarn 锁文件。

* 使用共享 API 契约，避免前后端重复手写字段。

* 业务模块按领域拆分，不将所有逻辑塞进通用工具文件。

* 数据库变更通过迁移文件提交，不允许生产环境随意手动改表。

* 不提交 `.env`、密钥、生产数据库备份或用户敏感数据。

* 通过 `.env.example` 说明必需配置，但不得填入真实凭据。

## 8. 数据库设计

### 8.1 主要表

| 表名                            | 主要职责      |
| ----------------------------- | --------- |
| `users`                       | 后台用户      |
| `roles` / `user_roles`        | 角色和用户角色关系 |
| `contents`                    | 统一内容主表    |
| `articles`                    | 文章专属字段    |
| `places`                      | 地点、坐标和地址  |
| `people`                      | 人物资料      |
| `events`                      | 历史事件      |
| `traditions`                  | 民俗、传统与技艺  |
| `routes` / `route_stops`      | 路线与有序站点   |
| `topics` / `topic_contents`   | 专题及内容集合   |
| `content_relations`           | 内容之间的关联   |
| `media`                       | 图片与媒体元数据  |
| `content_media`               | 内容与媒体关联   |
| `sources` / `content_sources` | 资料来源与引用关系 |
| `tags` / `content_tags`       | 标签体系      |
| `revisions`                   | 内容版本记录    |
| `review_records`              | 审核记录      |
| `audit_logs`                  | 安全与管理操作审计 |

### 8.2 核心内容表设计

建议 `contents` 作为统一的身份、状态和 SEO 主表，类型专属数据放在对应子表中。

SQL

```
CREATE TABLE contents (
    id UUID PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    title VARCHAR(240) NOT NULL,
    summary TEXT,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    featured_image_id UUID,
    author_id UUID,
    reviewer_id UUID,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_contents_status_published
    ON contents (status, published_at DESC);

CREATE INDEX idx_contents_type_status
    ON contents (type, status);
```

地点表单独保存地理信息。PostGIS 迁移应使用真实 PostgreSQL 扩展，而不能只在 ORM 中把坐标当普通字符串。

SQL

```
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE places (
    content_id UUID PRIMARY KEY REFERENCES contents(id),
    address TEXT,
    location GEOGRAPHY(POINT, 4326),
    location_accuracy VARCHAR(24),
    location_verified BOOLEAN NOT NULL DEFAULT FALSE,
    place_type VARCHAR(48),
    historical_period TEXT
);

CREATE INDEX idx_places_location
    ON places USING GIST (location);
```

文章正文可以在 `articles` 表中保存为 JSONB 文档，方便 Tiptap 结构化编辑；如需纯文本检索，建议额外维护可搜索的纯文本字段。不要把所有关联信息塞进一个 JSON 字段，否则后续难以可靠查询、审核和维护。

### 8.3 数据完整性约束

* `slug` 全局唯一，发布后修改 URL 需要保留旧 URL 的重定向。

* 已发布内容必须有标题、必要的正文或档案字段，以及明确的发布状态。

* 坐标使用经纬度规范，前端展示时不能混淆经纬度顺序。

* 软删除内容默认不参与公开查询。

* 多对多关系应设置唯一约束，避免重复关联。

* 数据库保存统一 UTC 时间，前端按用户或站点时区展示。

* 内容版本、审核记录和审计记录不能因为普通内容编辑而被覆盖删除。

### 8.4 地理查询示例

以下 SQL 用于查询指定坐标附近的已发布地点，距离以米为单位。

SQL

```
SELECT
    c.id,
    c.slug,
    c.title,
    ST_Y(p.location::geometry) AS latitude,
    ST_X(p.location::geometry) AS longitude,
    ST_Distance(
        p.location,
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
    ) AS distance_meters
FROM places p
JOIN contents c ON c.id = p.content_id
WHERE c.status = 'published'
  AND p.location IS NOT NULL
  AND ST_DWithin(
      p.location,
      ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
      :radius_meters
  )
ORDER BY distance_meters ASC
LIMIT :limit;
```

`:longitude`、`:latitude` 等参数必须使用参数化查询绑定，不能通过字符串拼接直接注入 SQL。

## 9. API 设计

### 9.1 API 规范

* API 前缀：`/api/v1`

* 数据格式：JSON

* API 文档：NestJS Swagger / OpenAPI

* 分页：统一采用 `page`、`pageSize`，大型列表可以升级为游标分页

* 错误响应：统一错误码、错误消息和请求追踪 ID

* 所有后台写入接口必须经过身份验证、权限检查和数据校验

* 公开接口只返回已发布且允许公开的内容

### 9.2 公开 API

| 方法  | 路径                       | 用途              |
| --- | ------------------------ | --------------- |
| GET | `/api/v1/home`           | 首页精选与栏目数据       |
| GET | `/api/v1/articles`       | 文章列表            |
| GET | `/api/v1/articles/:slug` | 文章详情            |
| GET | `/api/v1/places`         | 地点列表与地图筛选       |
| GET | `/api/v1/places/:slug`   | 地点详情            |
| GET | `/api/v1/people/:slug`   | 人物档案            |
| GET | `/api/v1/events/:slug`   | 历史事件            |
| GET | `/api/v1/topics`         | 专题列表            |
| GET | `/api/v1/topics/:slug`   | 专题详情            |
| GET | `/api/v1/routes/:slug`   | 路线详情            |
| GET | `/api/v1/search`         | 统一搜索            |
| GET | `/api/v1/sitemap.xml`    | 站点地图，可由 Web 层生成 |

地点查询可接受 `bbox`（地图范围）、`type`、`q`、`limit` 等参数，并设置最大结果数。不要默认一次返回南京所有地点及其完整正文。

### 9.3 后台 API

| 方法                   | 路径                                   | 用途         |
| -------------------- | ------------------------------------ | ---------- |
| POST                 | `/api/v1/admin/auth/login`           | 后台登录       |
| POST                 | `/api/v1/admin/auth/logout`          | 退出登录       |
| GET                  | `/api/v1/admin/me`                   | 获取当前用户     |
| GET / POST           | `/api/v1/admin/articles`             | 文章列表与创建    |
| GET / PATCH / DELETE | `/api/v1/admin/articles/:id`         | 编辑、更新与删除文章 |
| POST                 | `/api/v1/admin/articles/:id/submit`  | 提交审核       |
| POST                 | `/api/v1/admin/articles/:id/approve` | 审核通过       |
| POST                 | `/api/v1/admin/articles/:id/reject`  | 退回修改       |
| POST                 | `/api/v1/admin/articles/:id/publish` | 发布内容       |
| CRUD                 | `/api/v1/admin/places`               | 地点管理       |
| CRUD                 | `/api/v1/admin/media`                | 媒体管理       |
| CRUD                 | `/api/v1/admin/sources`              | 来源管理       |
| GET                  | `/api/v1/admin/audit-logs`           | 审计日志查询     |

`DELETE` 不代表可以绕过版本保留与审计。正式系统应定义软删除、恢复和永久删除策略。

### 9.4 统一响应格式

成功响应示例：

JSON

```
{
  "data": {
    "id": "content-uuid",
    "slug": "example-place",
    "title": "示例地点"
  },
  "meta": {
    "requestId": "request-id"
  }
}
```

分页响应：

JSON

```
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

错误响应示例：

JSON

```
{
  "error": {
    "code": "CONTENT_NOT_FOUND",
    "message": "内容不存在",
    "requestId": "request-id"
  }
}
```

实际实现中，错误消息应避免泄露数据库结构、服务器路径、内部堆栈或敏感用户信息。

## 10. 管理后台详细需求

后台不是公开网站的一个隐藏页面，而是独立的内容生产系统。

### 10.1 后台导航

工作台

待审核、最近更新、内容统计

内容管理

文章、人物、事件、民俗

地点与地图

坐标、地点分类、路线站点

媒体与来源

图片、授权、引用、来源核验

审核发布

审核、退回、发布、归档

系统管理

用户、角色、站点配置、日志

### 10.2 文章编辑器

采用 Tiptap 实现结构化富文本编辑，至少支持：

* 标题、正文段落、加粗、斜体、引用和列表。

* 图片上传、图片说明、摄影者和版权信息。

* 外部链接与内部内容链接。

* 表格、分隔线、标题锚点。

* 自动保存草稿和明确的保存状态。

* 编辑预览、发布预览和正式页面预览。

* 文章目录生成。

* 来源引用和关联地点的选择器。

* 内容版本记录与修改历史。

* 发布前的必填项校验。

不建议将未经校验的 HTML 直接写入数据库并原样输出。优先存储 Tiptap JSON 文档，服务端验证允许的节点和属性，渲染时进行必要的安全处理。

### 10.3 媒体管理

每个媒体文件至少记录：

* 文件 ID、存储键、文件类型、文件大小。

* 图片宽高、替代文本和说明。

* 上传者与上传时间。

* 摄影者、来源 URL、版权持有人。

* 授权方式、授权凭证或备注。

* 是否允许公开展示。

* 使用该文件的内容清单。

上传时检查文件类型和大小，生成不可预测的对象键；对不受信任的文件名和 MIME 类型不能盲目信任。公开图片使用对象存储的公开读取策略或受控 CDN，不将存储密钥暴露给浏览器。

### 10.4 角色与权限

| 权限      | 管理员 | 编辑      | 审核人员  |
| ------- | --- | ------- | ----- |
| 查看后台    | 是   | 是       | 是     |
| 创建、编辑内容 | 是   | 是       | 按需    |
| 提交审核    | 是   | 是       | 否     |
| 审核与退回   | 是   | 否       | 是     |
| 发布内容    | 是   | 否       | 按策略授权 |
| 管理用户和角色 | 是   | 否       | 否     |
| 修改系统配置  | 是   | 否       | 否     |
| 查看审计日志  | 是   | 本人相关或受限 | 按需    |

后台至少应支持 `admin`、`editor`、`reviewer` 三种角色。首期可以不做复杂的字段级权限，但服务端必须逐接口执行权限检查。

## 11. 搜索、SEO 与内容发现

### 11.1 搜索功能

MVP 搜索范围包括：

* 文章标题和正文。

* 地点名称、别名和简介。

* 人物姓名和别名。

* 历史事件名称。

* 专题标题与标签。

首期优先使用 PostgreSQL 全文检索、`pg_trgm` 模糊匹配和别名字段组合。中文全文检索效果取决于分词策略；如果实测结果不佳，再引入适合中文的搜索方案或独立搜索服务，不应一开始就部署 Elasticsearch 等重型组件。

搜索结果需要区分内容类型，支持筛选、排序和分页。未发布内容不得通过公开搜索接口泄漏。

### 11.2 SEO 实施

* 文章、地点、人物和专题使用稳定、可读的 URL。

* 生成动态 `title`、`description`、规范 URL。

* 提供 XML Sitemap、Robots 规则与 Open Graph 元信息。

* 仅将已发布、允许索引的页面加入 Sitemap。

* 正确处理 404、重定向、重复内容和分页元信息。

* 重要内容页面优先使用服务端渲染或静态生成。

* 为图片设置替代文本、宽高属性和合理的压缩格式。

* 对公开 API 和后台 API 设置明确的缓存与访问规则。

例如：

```
/chronicle/nanjing-city-wall
/places/qinhuai-river
/topics/nanjing-city-transformation
/routes/old-city-walk
```

英文 slug 可以保留，但中文标题、描述和页面正文应作为主要内容。品牌使用 Nanking Atlas，不意味着每个页面都必须使用历史英文拼写。

## 12. 安全与合规要求

### 12.1 认证安全

* 使用经过验证的密码哈希算法，例如 Argon2id 或合适配置的 bcrypt。

* 登录接口实施限流和失败次数控制。

* Cookie 会话应配置 `HttpOnly`、`Secure` 和适当的 `SameSite` 属性。

* 如果使用 Cookie 身份认证，写入接口还必须考虑 CSRF 防护。

* 若使用 JWT，需要制定有效期、刷新、撤销与密钥轮换策略。

* 后台启用合理的会话过期机制，生产环境优先支持多因素认证。

* 不把访问令牌、密码或密钥写入日志。

### 12.2 应用安全

* 服务端执行 RBAC 权限检查。

* 对所有请求进行 DTO 校验。

* ORM 和 SQL 使用参数化查询。

* 富文本输出采用允许列表和安全渲染。

* 限制上传文件的大小、类型与数量。

* 设置适当的 CORS 白名单、内容安全策略和安全响应头。

* 管理员敏感操作写入审计日志。

* 生产环境禁用调试接口和详细错误堆栈输出。

* 依赖漏洞扫描与密钥扫描纳入 CI。

### 12.3 数据备份

* 数据库实施自动备份。

* 对重要内容变更保留版本记录。

* 对对象存储制定版本保留和恢复策略。

* 明确备份保留期限与恢复点目标。

* 定期执行恢复演练，而不仅仅确认备份文件存在。

### 12.4 中国大陆运营需要单独评估

项目定位为文化网站，并不自动意味着可以忽略网站运营合规。若计划面向中国大陆公众正式提供服务，应结合服务器所在地、域名、主办主体、网站功能及实际运营模式，核实 ICP 备案、公安联网备案以及其他可能适用的要求。

如果网站允许公众投稿、评论或上传媒体，还需要增加相应的内容审核、举报和处置机制。地图服务需要核对服务商许可、地图数据使用限制和适用的测绘地理信息规定。不能仅因使用开源地图前端组件，就认为底图数据和相关服务不受限制。

## 13. 部署与环境配置

### 13.1 环境划分

| 环境                | 用途         | 数据策略       |
| ----------------- | ---------- | ---------- |
| Local             | 本地开发       | 使用虚拟或种子数据  |
| Preview / Staging | 预览、验收、回归测试 | 使用脱敏数据     |
| Production        | 正式网站       | 正式数据、备份和监控 |

### 13.2 环境变量示例

dotenv

```
# API
NODE_ENV=production
PORT=3000
PUBLIC_SITE_URL=https://www.example.com
ADMIN_SITE_URL=https://admin.example.com

# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/nanking_atlas

# Auth: use a securely generated secret in deployment
SESSION_SECRET=replace-with-a-long-random-secret

# Object storage
S3_ENDPOINT=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Optional cache
REDIS_URL=
```

以上仅用于说明配置结构。真实密码、密钥和生产连接地址必须由部署环境安全注入，不能直接提交到 Git。

### 13.3 CI/CD 流程

Diagram options

![](data\:image/svg+xml;utf8,%3Csvg%20id%3D%22mermaid-_r_3oq_%22%20width%3D%22428.00006103515625%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20class%3D%22flowchart%22%20height%3D%221042%22%20viewBox%3D%224%204%20428.00006103515625%201042%22%20role%3D%22graphics-document%20document%22%20aria-roledescription%3D%22flowchart-v2%22%3E%3Cstyle%3E%23mermaid-_r_3oq_%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%40keyframes%20edge-animation-frame%7Bfrom%7Bstroke-dashoffset%3A0%3B%7D%7D%40keyframes%20dash%7Bto%7Bstroke-dashoffset%3A0%3B%7D%7D%23mermaid-_r_3oq_%20.edge-animation-slow%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2050s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_3oq_%20.edge-animation-fast%7Bstroke-dasharray%3A9%2C5!important%3Bstroke-dashoffset%3A900%3Banimation%3Adash%2020s%20linear%20infinite%3Bstroke-linecap%3Around%3B%7D%23mermaid-_r_3oq_%20.error-icon%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3B%7D%23mermaid-_r_3oq_%20.error-text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bstroke%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20.edge-thickness-normal%7Bstroke-width%3A1px%3B%7D%23mermaid-_r_3oq_%20.edge-thickness-thick%7Bstroke-width%3A3.5px%3B%7D%23mermaid-_r_3oq_%20.edge-pattern-solid%7Bstroke-dasharray%3A0%3B%7D%23mermaid-_r_3oq_%20.edge-thickness-invisible%7Bstroke-width%3A0%3Bfill%3Anone%3B%7D%23mermaid-_r_3oq_%20.edge-pattern-dashed%7Bstroke-dasharray%3A3%3B%7D%23mermaid-_r_3oq_%20.edge-pattern-dotted%7Bstroke-dasharray%3A2%3B%7D%23mermaid-_r_3oq_%20.marker%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3oq_%20.marker.cross%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3oq_%20svg%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A14px%3B%7D%23mermaid-_r_3oq_%20p%7Bmargin%3A0%3B%7D%23mermaid-_r_3oq_%20.label%7Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20.cluster-label%20text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20.cluster-label%20span%7Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20.cluster-label%20span%20p%7Bbackground-color%3Atransparent%3B%7D%23mermaid-_r_3oq_%20.label%20text%2C%23mermaid-_r_3oq_%20span%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20.node%20rect%2C%23mermaid-_r_3oq_%20.node%20circle%2C%23mermaid-_r_3oq_%20.node%20ellipse%2C%23mermaid-_r_3oq_%20.node%20polygon%2C%23mermaid-_r_3oq_%20.node%20path%7Bfill%3Argb\(222%2C%20234%2C%20251\)%3Bstroke%3Argb\(83%2C%20154%2C%20248\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3oq_%20.rough-node%20.label%20text%2C%23mermaid-_r_3oq_%20.node%20.label%20text%2C%23mermaid-_r_3oq_%20.image-shape%20.label%2C%23mermaid-_r_3oq_%20.icon-shape%20.label%7Btext-anchor%3Amiddle%3B%7D%23mermaid-_r_3oq_%20.node%20.katex%20path%7Bfill%3A%23000%3Bstroke%3A%23000%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3oq_%20.rough-node%20.label%2C%23mermaid-_r_3oq_%20.node%20.label%2C%23mermaid-_r_3oq_%20.image-shape%20.label%2C%23mermaid-_r_3oq_%20.icon-shape%20.label%7Btext-align%3Acenter%3B%7D%23mermaid-_r_3oq_%20.node.clickable%7Bcursor%3Apointer%3B%7D%23mermaid-_r_3oq_%20.root%20.anchor%20path%7Bfill%3Argb\(93%2C%2093%2C%2093\)!important%3Bstroke-width%3A0%3Bstroke%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3oq_%20.arrowheadPath%7Bfill%3Argb\(93%2C%2093%2C%2093\)%3B%7D%23mermaid-_r_3oq_%20.edgePath%20.path%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bstroke-width%3A2.0px%3B%7D%23mermaid-_r_3oq_%20.flowchart-link%7Bstroke%3Argb\(93%2C%2093%2C%2093\)%3Bfill%3Anone%3B%7D%23mermaid-_r_3oq_%20.edgeLabel%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Btext-align%3Acenter%3B%7D%23mermaid-_r_3oq_%20.edgeLabel%20p%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_3oq_%20.edgeLabel%20rect%7Bopacity%3A0.5%3Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_3oq_%20.labelBkg%7Bbackground-color%3Argba\(252%2C%20252%2C%20252%2C%200.5\)%3B%7D%23mermaid-_r_3oq_%20.cluster%20rect%7Bfill%3Argb\(249%2C%20249%2C%20249\)%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.05\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3oq_%20.cluster%20text%7Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20.cluster%20span%7Bcolor%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20div.mermaidTooltip%7Bposition%3Aabsolute%3Btext-align%3Acenter%3Bmax-width%3A200px%3Bpadding%3A2px%3Bfont-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3Bfont-size%3A12px%3Bbackground%3Argb\(249%2C%20249%2C%20249\)%3Bborder%3A1px%20solid%20rgba\(0%2C%200%2C%200%2C%200.05\)%3Bborder-radius%3A2px%3Bpointer-events%3Anone%3Bz-index%3A100%3B%7D%23mermaid-_r_3oq_%20.flowchartTitleText%7Btext-anchor%3Amiddle%3Bfont-size%3A18px%3Bfill%3Argb\(13%2C%2013%2C%2013\)%3B%7D%23mermaid-_r_3oq_%20rect.text%7Bfill%3Anone%3Bstroke-width%3A0%3B%7D%23mermaid-_r_3oq_%20.icon-shape%2C%23mermaid-_r_3oq_%20.image-shape%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Btext-align%3Acenter%3B%7D%23mermaid-_r_3oq_%20.icon-shape%20p%2C%23mermaid-_r_3oq_%20.image-shape%20p%7Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bpadding%3A2px%3B%7D%23mermaid-_r_3oq_%20.icon-shape%20rect%2C%23mermaid-_r_3oq_%20.image-shape%20rect%7Bopacity%3A0.5%3Bbackground-color%3Argb\(252%2C%20252%2C%20252\)%3Bfill%3Argb\(252%2C%20252%2C%20252\)%3B%7D%23mermaid-_r_3oq_%20.label-icon%7Bdisplay%3Ainline-block%3Bheight%3A1em%3Boverflow%3Avisible%3Bvertical-align%3A-0.125em%3B%7D%23mermaid-_r_3oq_%20.node%20.label-icon%20path%7Bfill%3AcurrentColor%3Bstroke%3Arevert%3Bstroke-width%3Arevert%3B%7D%23mermaid-_r_3oq_%20.node%20text%7Bfont-size%3A16px%3Bfont-weight%3A600%3Bletter-spacing%3A-0.32px%3Bfill%3A%23004f99%3B%7D%23mermaid-_r_3oq_%20.edgeLabels%20text%7Bfont-size%3A13px%3Bfont-weight%3A600%3Bletter-spacing%3A-0.08px%3Bfill%3A%23004f99%3B%7D%23mermaid-_r_3oq_%20.node%20tspan%5Bfont-weight%3D%22normal%22%5D%2C%23mermaid-_r_3oq_%20.edgeLabels%20tspan%5Bfont-weight%3D%22normal%22%5D%7Bfont-weight%3A600%3B%7D%23mermaid-_r_3oq_%20.edgeLabel%20.label%20rect%7Bopacity%3A1%3Brx%3A13px%3Bry%3A13px%3Bfill%3A%23f5faff%3Bstroke%3Argb\(206%2C%20219%2C%20229\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3oq_%20.node%20rect%2C%23mermaid-_r_3oq_%20.node%20circle%2C%23mermaid-_r_3oq_%20.node%20ellipse%2C%23mermaid-_r_3oq_%20.node%20polygon%2C%23mermaid-_r_3oq_%20.node%20path%7Bfill%3Argb\(229%2C%20243%2C%20255\)%3Bstroke%3Argba\(0%2C%200%2C%200%2C%200.1\)%3Bstroke-width%3A1px%3B%7D%23mermaid-_r_3oq_%20.node%20rect%7Brx%3A16px%3Bry%3A16px%3B%7D%23mermaid-_r_3oq_%20.node.mermaid-decision%20.label-container%7Bfill%3A%23f5faff%3Bstroke%3Argb\(206%2C%20219%2C%20229\)%3Bstroke-dasharray%3A2%202%3B%7D%23mermaid-_r_3oq_%20.edgePaths%20.flowchart-link%7Bstroke%3Argb\(206%2C%20219%2C%20229\)%3Bstroke-width%3A1px%3Bstroke-linecap%3Around%3Bstroke-linejoin%3Around%3B%7D%23mermaid-_r_3oq_%20.marker%7Bfill%3Argb\(206%2C%20219%2C%20229\)%3Bstroke%3Argb\(206%2C%20219%2C%20229\)%3B%7D%23mermaid-_r_3oq_%20.node%7Bcolor-scheme%3Alight%3B%7D%23mermaid-_r_3oq_%20%3Aroot%7B--mermaid-font-family%3A%22-apple-system%22%2C%22BlinkMacSystemFont%22%2C%22Segoe%20UI%22%2C%22Roboto%22%2C%22Oxygen%22%2C%22Ubuntu%22%2C%22Cantarell%22%2C%22Helvetica%20Neue%22%2C%22Arial%22%2C%22sans-serif%22%3B%7D%3C%2Fstyle%3E%3Cg%3E%3Cmarker%20id%3D%22mermaid-_r_3oq__flowchart-v2-pointEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%22-5%20-5%2010%2010%22%20refX%3D%220%22%20refY%3D%220%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2210%22%20markerHeight%3D%2210%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%204%200%20M%200.8180194846605362%20-3.181980515339464%20L%204%200%20L%200.8180194846605362%203.181980515339464%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%20none%3B%20fill%3A%20none%3B%20stroke-linecap%3A%20round%3B%20stroke-linejoin%3A%20round%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3oq__flowchart-v2-pointStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%22-5%20-5%2010%2010%22%20refX%3D%220%22%20refY%3D%220%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2210%22%20markerHeight%3D%2210%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%200%200%20L%20-4%200%20M%20-0.8180194846605362%20-3.181980515339464%20L%20-4%200%20L%20-0.8180194846605362%203.181980515339464%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%20none%3B%20fill%3A%20none%3B%20stroke-linecap%3A%20round%3B%20stroke-linejoin%3A%20round%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3oq__flowchart-v2-circleEnd%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%2211%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3oq__flowchart-v2-circleStart%22%20class%3D%22marker%20flowchart-v2%22%20viewBox%3D%220%200%2010%2010%22%20refX%3D%22-1%22%20refY%3D%225%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%225%22%20r%3D%225%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%201%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fcircle%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3oq__flowchart-v2-crossEnd%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%2212%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3Cmarker%20id%3D%22mermaid-_r_3oq__flowchart-v2-crossStart%22%20class%3D%22marker%20cross%20flowchart-v2%22%20viewBox%3D%220%200%2011%2011%22%20refX%3D%22-1%22%20refY%3D%225.2%22%20markerUnits%3D%22userSpaceOnUse%22%20markerWidth%3D%2211%22%20markerHeight%3D%2211%22%20orient%3D%22auto%22%3E%3Cpath%20d%3D%22M%201%2C1%20l%209%2C9%20M%2010%2C1%20l%20-9%2C9%22%20class%3D%22arrowMarkerPath%22%20style%3D%22stroke-width%3A%202%3B%20stroke-dasharray%3A%201%2C%200%3B%22%3E%3C%2Fpath%3E%3C%2Fmarker%3E%3C%2Fg%3E%3Cg%20class%3D%22subgraphs%22%3E%3C%2Fg%3E%3Cg%20class%3D%22nodes%22%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-A-0%22%20transform%3D%22translate\(293.626708984375%2C%2042\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-117.96752166748047%22%20y%3D%22-30%22%20width%3D%22235.93504333496094%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E6%8F%90%E4%BA%A4%E4%BB%A3%E7%A0%81%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20%2F%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Pull%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Request%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-B-1%22%20transform%3D%22translate\(293.626708984375%2C%20142\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-91.0400161743164%22%20y%3D%22-30%22%20width%3D%22182.0800323486328%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E6%A0%BC%E5%BC%8F%E4%B8%8E%E9%9D%99%E6%80%81%E6%A3%80%E6%9F%A5%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-C-3%22%20transform%3D%22translate\(293.626708984375%2C%20242\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-106.72002410888672%22%20y%3D%22-30%22%20width%3D%22213.44004821777344%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%8D%95%E5%85%83%E6%B5%8B%E8%AF%95%E4%B8%8E%E7%B1%BB%E5%9E%8B%E6%A3%80%E6%9F%A5%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-D-5%22%20transform%3D%22translate\(293.626708984375%2C%20342\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-120.6500015258789%22%20y%3D%22-30%22%20width%3D%22241.3000030517578%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E6%9E%84%E5%BB%BA%3C%2Ftspan%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%20Web%E3%80%81Admin%E3%80%81API%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-E-7%22%20transform%3D%22translate\(293.626708984375%2C%20442\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-130.24002838134766%22%20y%3D%22-30%22%20width%3D%22260.4800567626953%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E6%95%B0%E6%8D%AE%E5%BA%93%E8%BF%81%E7%A7%BB%E6%A3%80%E6%9F%A5%E4%B8%8E%E9%9B%86%E6%88%90%E6%B5%8B%E8%AF%95%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%20%20mermaid-decision%22%20id%3D%22flowchart-F-9%22%20transform%3D%22translate\(293.626708984375%2C%20542\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-70.96001052856445%22%20y%3D%22-30%22%20width%3D%22141.9200210571289%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%85%A8%E9%83%A8%E9%80%9A%E8%BF%87%3F%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-G-11%22%20transform%3D%22translate\(103.0400161743164%2C%20708\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-91.0400161743164%22%20y%3D%22-30%22%20width%3D%22182.0800323486328%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E9%98%BB%E6%AD%A2%E5%90%88%E5%B9%B6%E5%B9%B6%E4%BF%AE%E5%A4%8D%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-H-13%22%20transform%3D%22translate\(317.28004455566406%2C%20708\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-83.20001220703125%22%20y%3D%22-30%22%20width%3D%22166.4000244140625%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E9%83%A8%E7%BD%B2%E9%A2%84%E8%A7%88%E7%8E%AF%E5%A2%83%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-I-15%22%20transform%3D%22translate\(317.28004455566406%2C%20808\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-67.5200080871582%22%20y%3D%22-30%22%20width%3D%22135.0400161743164%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E4%BA%BA%E5%B7%A5%E9%AA%8C%E6%94%B6%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-J-17%22%20transform%3D%22translate\(317.28004455566406%2C%20908\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-67.5200080871582%22%20y%3D%22-30%22%20width%3D%22135.0400161743164%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E7%94%9F%E4%BA%A7%E5%8F%91%E5%B8%83%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22node%20default%22%20id%3D%22flowchart-K-19%22%20transform%3D%22translate\(317.28004455566406%2C%201008\)%22%3E%3Crect%20class%3D%22basic%20label-container%22%20style%3D%22%22%20x%3D%22-106.72002410888672%22%20y%3D%22-30%22%20width%3D%22213.44004821777344%22%20height%3D%2260%22%3E%3C%2Frect%3E%3Cg%20class%3D%22label%22%20style%3D%22%22%20transform%3D%22translate\(0%2C%20-10.800000190734863\)%22%3E%3Crect%3E%3C%2Frect%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%81%A5%E5%BA%B7%E6%A3%80%E6%9F%A5%E4%B8%8E%E9%94%99%E8%AF%AF%E7%9B%91%E6%8E%A7%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edges%20edgePaths%22%3E%3Cpath%20d%3D%22M293.626708984375%2C72L293.626708984375%2C100%22%20id%3D%22L_A_B_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_A_B_0%22%20data-points%3D%22W3sieCI6MjkzLjYyNjcwODk4NDM3NSwieSI6NzJ9LHsieCI6MjkzLjYyNjcwODk4NDM3NSwieSI6MTA0fV0%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M293.626708984375%2C172L293.626708984375%2C200%22%20id%3D%22L_B_C_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_B_C_0%22%20data-points%3D%22W3sieCI6MjkzLjYyNjcwODk4NDM3NSwieSI6MTcyfSx7IngiOjI5My42MjY3MDg5ODQzNzUsInkiOjIwNH1d%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M293.626708984375%2C272L293.626708984375%2C300%22%20id%3D%22L_C_D_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_C_D_0%22%20data-points%3D%22W3sieCI6MjkzLjYyNjcwODk4NDM3NSwieSI6MjcyfSx7IngiOjI5My42MjY3MDg5ODQzNzUsInkiOjMwNH1d%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M293.626708984375%2C372L293.626708984375%2C400%22%20id%3D%22L_D_E_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_D_E_0%22%20data-points%3D%22W3sieCI6MjkzLjYyNjcwODk4NDM3NSwieSI6MzcyfSx7IngiOjI5My42MjY3MDg5ODQzNzUsInkiOjQwNH1d%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M293.626708984375%2C472L293.626708984375%2C500%22%20id%3D%22L_E_F_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_E_F_0%22%20data-points%3D%22W3sieCI6MjkzLjYyNjcwODk4NDM3NSwieSI6NDcyfSx7IngiOjI5My42MjY3MDg5ODQzNzUsInkiOjUwNH1d%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M269.9733734130859%2C572L269.97337341308594%2C584.9289321881346Q269.97337341308594%2C592%20262.90230560122046%2C592L109.82297219961106%2C592Q108.0400161743164%2C592%20106.62580261194331%2C593.0857864376269L106.62580261194331%2C593.0857864376269Q105.21158904957022%2C594.1715728752538%20104.12580261194333%2C595.5857864376269L104.12580261194331%2C595.5857864376269Q103.0400161743164%2C597%20103.0400161743164%2C598.7829560252947L103.0400161743164%2C666%22%20id%3D%22L_F_G_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_F_G_0%22%20data-points%3D%22W3sieCI6MjY5Ljk3MzM3MzQxMzA4NTksInkiOjU3Mn0seyJ4IjoyNjkuOTczMzczNDEzMDg1OTQsInkiOjU5Mn0seyJ4IjoxMDMuMDQwMDE2MTc0MzE2NCwieSI6NTkyfSx7IngiOjEwMy4wNDAwMTYxNzQzMTY0LCJ5Ijo2NzB9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M317.2800445556641%2C572L317.28004455566406%2C666%22%20id%3D%22L_F_H_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_F_H_0%22%20data-points%3D%22W3sieCI6MzE3LjI4MDA0NDU1NTY2NDEsInkiOjU3Mn0seyJ4IjozMTcuMjgwMDQ0NTU1NjY0MDYsInkiOjY3MH1d%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M317.28004455566406%2C738L317.28004455566406%2C766%22%20id%3D%22L_H_I_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_H_I_0%22%20data-points%3D%22W3sieCI6MzE3LjI4MDA0NDU1NTY2NDA2LCJ5Ijo3Mzh9LHsieCI6MzE3LjI4MDA0NDU1NTY2NDA2LCJ5Ijo3NzB9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M317.28004455566406%2C838L317.28004455566406%2C866%22%20id%3D%22L_I_J_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_I_J_0%22%20data-points%3D%22W3sieCI6MzE3LjI4MDA0NDU1NTY2NDA2LCJ5Ijo4Mzh9LHsieCI6MzE3LjI4MDA0NDU1NTY2NDA2LCJ5Ijo4NzB9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3Cpath%20d%3D%22M317.28004455566406%2C938L317.28004455566406%2C966%22%20id%3D%22L_J_K_0%22%20class%3D%22edge-thickness-normal%20edge-pattern-solid%20edge-thickness-normal%20edge-pattern-solid%20flowchart-link%22%20style%3D%22%3B%22%20data-edge%3D%22true%22%20data-et%3D%22edge%22%20data-id%3D%22L_J_K_0%22%20data-points%3D%22W3sieCI6MzE3LjI4MDA0NDU1NTY2NDA2LCJ5Ijo5Mzh9LHsieCI6MzE3LjI4MDA0NDU1NTY2NDA2LCJ5Ijo5NzB9XQ%3D%3D%22%20marker-end%3D%22url\(%23mermaid-_r_3oq__flowchart-v2-pointEnd\)%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabels%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22stroke%3A%20none%22%3E%3C%2Frect%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_A_B_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_B_C_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_C_D_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_D_E_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_E_F_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(102.84001541137695%2C%20625\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_F_G_0%22%20transform%3D%22translate\(-6.799999237060547%2C-7.40000057220459\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-12%22%20y%3D%22-5.599999785423279%22%20width%3D%2237.60000038146973%22%20height%3D%2226%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E5%90%A6%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%20transform%3D%22translate\(317.0800437927246%2C%20625\)%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_F_H_0%22%20transform%3D%22translate\(-6.799999237060547%2C-7.40000057220459\)%22%3E%3Cg%3E%3Crect%20class%3D%22background%22%20style%3D%22%22%20x%3D%22-12%22%20y%3D%22-5.599999785423279%22%20width%3D%2237.60000038146973%22%20height%3D%2226%22%3E%3C%2Frect%3E%3Ctext%20y%3D%22-10.1%22%20style%3D%22%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3Ctspan%20font-style%3D%22normal%22%20class%3D%22text-inner-tspan%22%20font-weight%3D%22normal%22%3E%E6%98%AF%3C%2Ftspan%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_H_I_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_I_J_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3Cg%20class%3D%22edgeLabel%22%3E%3Cg%20class%3D%22label%22%20data-id%3D%22L_J_K_0%22%20transform%3D%22translate\(0%2C%200\)%22%3E%3Ctext%20y%3D%22-10.1%22%3E%3Ctspan%20class%3D%22text-outer-tspan%22%20x%3D%220%22%20y%3D%22-0.1em%22%20dy%3D%221.1em%22%3E%3C%2Ftspan%3E%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E)

公开网站与管理后台可以分别绑定各自的 Netlify 构建配置，指定不同的 Base Directory 和构建命令。API 使用独立的容器镜像或 Node.js 部署流程。生产数据库迁移应作为明确的发布步骤，不应由多个应用实例同时无控制地执行。

### 13.4 监控指标

首期至少监控：

* API 健康状态、响应时间和错误率。

* 数据库连接数、慢查询和存储空间。

* 网站构建失败与发布状态。

* 图片上传失败、文件存储容量。

* 登录失败与异常后台操作。

* 备份成功率和恢复演练结果。

日志中应使用请求 ID 关联请求，不记录密码、令牌或不必要的个人数据。

## 14. 测试与验收标准

### 14.1 测试层次

| 测试类别     | 工具或方法               | 验证重点             |
| -------- | ------------------- | ---------------- |
| 单元测试     | Vitest              | 内容状态、校验规则、权限判断   |
| API 集成测试 | NestJS 测试工具 + 测试数据库 | 接口、事务、权限与错误处理    |
| 端到端测试    | Playwright          | 登录、编辑、审核、发布、地图操作 |
| 视觉回归     | Playwright 截图       | 首页、文章、后台主要页面     |
| 安全测试     | 依赖扫描、权限测试、人工检查      | 越权、注入、XSS、文件上传   |
| 性能测试     | Lighthouse 与接口压测    | 页面加载、API 延迟、并发行为 |
| 备份恢复测试   | 独立恢复演练              | 数据库与媒体能否恢复       |

### 14.2 MVP 验收清单

## 验收清单

0 / 16 项

公开网站

首页可以展示后台配置的精选内容

文章、地点和专题详情可通过稳定 URL 访问

手机和桌面布局均可正常使用

页面有正确的标题、描述和基础 SEO 信息

地图

可显示已发布且坐标有效的地点

筛选、地图标记和地点列表可以联动

地点详情可查看相关内容

地图服务失败时仍可使用地点列表

管理后台

编辑可以创建、保存和修改草稿

编辑可提交审核，审核人员可通过或退回

发布操作受到服务端权限控制

图片上传、来源记录和内容关联可正常工作

安全与运营

未登录用户不能访问受保护的后台接口

编辑不能绕过权限自行审核或发布

错误请求不会泄露内部堆栈或密钥

数据库备份和恢复流程通过验证

重置清单复制验收清单

### 14.3 建议性能目标

这些是首期的工程目标，不是未测试的性能承诺：

* 公开页面在常规网络条件下保持良好的 Core Web Vitals。

* 图片采用合适尺寸、响应式格式与延迟加载。

* 地图仅加载当前视口需要的地点数据。

* 列表使用分页，接口设置合理的查询上限。

* 后台列表筛选和保存操作应有清晰的加载、成功和失败反馈。

* 为关键 API 设定可测量的响应时间目标，并在真实部署环境中压测后调整。

## 15. 开发实施计划

建议采用分阶段交付，每个阶段结束后都有可运行、可验收的成果。不建议一开始就同时开发所有内容类型和复杂地图能力。

# P0

工程基础

阶段一：工程骨架与视觉基础

建议 3–5 个工作日

* 初始化 pnpm + Turborepo。

* 创建 Web、Admin、API 三个应用。

* 建立共享类型、代码规范、CI 和环境配置。

* 完成品牌设计系统、首页静态原型和基础导航。

交付物： 可本地启动的工程、基础页面、开发文档。

# P1

内容系统

阶段二：数据库与管理后台

建议 1–2 周

* 建立数据库模型与迁移。

* 实现登录、角色权限和审计日志。

* 完成文章编辑、媒体管理、来源管理。

* 实现草稿、提交审核、审核退回和发布。

交付物： 可管理真实内容的后台 MVP。

# P2

公开网站

阶段三：文化网站核心页面

建议 1–2 周

* 完成首页、栏目列表和文章详情。

* 完成地点详情、专题页面与关联内容。

* 实现 SEO、Sitemap、响应式布局。

* 建立发布后缓存更新机制。

交付物： 内容可以从后台发布到公开网站。

# P3

地图与发现

阶段四：街巷地图与内容关联

建议 1–2 周

* 接入地图底图和地点标记。

* 实现分类筛选、地图与列表联动。

* 完成附近地点查询和内容关联。

* 增加统一搜索与探索路线页面。

交付物： 可交互的南京文化地图。

# P4

正式上线

阶段五：测试、部署与内容上线

建议 3–5 个工作日

* 完成端到端测试和安全检查。

* 配置生产域名、HTTPS、备份和监控。

* 核验 Netlify、API、地图及对象存储。

* 导入首批经过核验的内容并正式发布。

交付物： 可访问、可运营、可维护的首期网站。

时间仅为初步估算。实际周期取决于开发人员数量、内容量、地图服务配置和设计精细程度；单人开发时，建议按阶段验收而不是承诺固定上线日期。

## 16. 首批内容建设计划

网站技术上线并不等于文化内容平台已经成立。建议在开发期间同步建设第一批内容，避免上线后只有空栏目。

| 内容类型   | 建议首批数量  | 重点          |
| ------ | ------- | ----------- |
| 文化文章   | 10–15 篇 | 城市历史、街巷、建筑  |
| 地点档案   | 30–50 个 | 坐标、简介、历史信息  |
| 城市专题   | 3–5 个   | 跨文章和地点的主题策展 |
| 人物档案   | 5–10 个  | 有可靠资料支持的人物  |
| 历史事件   | 5–10 个  | 时间、背景、相关地点  |
| 城市探索路线 | 2–3 条   | 站点、顺序、路线说明  |
| 生活故事   | 5–10 篇  | 老店、饮食、社区与民俗 |

数量是内容规划建议，不是必须一次完成的硬指标。宁可少一些，也要保证来源、版权和事实准确性。

### 内容建设原则

1. 每篇文章尽量关联至少一个地点或专题。

2. 每个地点尽量关联至少一条可靠来源或一篇本站文章。

3. 图片需要有明确的授权或合法使用依据。

4. 对存在争议的历史信息记录不同说法与出处。

5. 设置内容纠错渠道，并建立纠错后的复核流程。

## 17. 成本规划

以下是规划层面的成本构成，不代表已查询或锁定当前供应商报价。

| 项目         | 首期策略               | 成本控制方式         |
| ---------- | ------------------ | -------------- |
| 公开网站托管     | Netlify            | 先用免费额度，监控构建和流量 |
| 管理后台托管     | Netlify 静态站点       | 独立构建与域名        |
| API 服务     | 小型 VPS 或免费额度内的容器平台 | 优先模块化单体，避免过度拆分 |
| PostgreSQL | 托管数据库或自建           | 按备份、稳定性与运维能力选择 |
| 图片存储       | 对象存储               | 压缩图片、限制原图体积    |
| 地图         | 符合许可的地图服务          | 先核验免费额度和访问限制   |
| 域名         | 单独购买               | 按注册商和后缀实际报价    |
| 邮件服务       | 按需接入               | 初期只满足管理员通知     |
| 监控         | 开源工具或平台免费额度        | 优先健康检查、错误日志与备份 |

推荐的省钱顺序：

* 第一阶段：本地开发，使用种子数据和本地数据库。

* 第二阶段：将公开网站部署到 Netlify 预览环境。

* 第三阶段：选择一套 API + PostgreSQL 部署方案。

* 第四阶段：内容量和访问量增长后，再增加缓存、搜索服务和更高等级的托管服务。

不要为了“全部免费”而把数据库、图片和 API 分散到太多不稳定的免费平台。数据可恢复、服务可维护比节省少量月费更重要。

## 18. 后续扩展方向

MVP 稳定后，可以按照实际需求逐步增加：

* 多语言：中文为主，未来支持英文内容与双语导航。

* 数字档案：保存历史图片、文献引用、地图旧址与变迁记录。

* 时间轴：把事件、人物和地点关联到历史时间。

* 路线策展：按历史主题、步行范围和地点类型组织路线。

* 公众投稿：提交地点、老照片和口述历史，进入审核流程。

* AI 研究助手：帮助编辑提取资料、生成摘要、发现重复内容和检查缺失来源。

* 开放数据接口：对符合授权条件的文化档案提供可引用的数据出口。

AI 辅助功能应放在编辑工作流中，而不是取代编辑审核。涉及历史人物、遗址、年代、版权和地点坐标的结果，都需要人工确认。

## 19. 项目启动时的开发约束

建议把以下规则写入项目根目录的 `AGENTS.md`，作为 AI 编程工具和开发者共同遵守的工程约定：

Nanking Atlas 工程开发约定

# Nanking Atlas 工程开发约定

## 项目目标

建设 Nanking Atlas（金陵风物志），一个以南京城市文化档案、街巷地图和城市生活记录为核心的文化网站。

## 技术栈

* Web：Next.js、React、TypeScript

* Admin：React、Vite、TypeScript

* API：NestJS、TypeScript

* Database：PostgreSQL、PostGIS

* ORM：Prisma

* UI：Tailwind CSS、shadcn/ui、Lucide React

* Map：Leaflet

* Editor：Tiptap

* Monorepo：pnpm、Turborepo

## 工程原则

1. 公开网站、管理后台和 API 分开部署。

2. 所有公开内容必须通过 API 或明确的数据访问层读取。

3. 所有后台权限由服务端强制执行，不能只依赖前端按钮隐藏。

4. 文章、地点、人物、事件、专题和来源必须支持可追溯关联。

5. 文化内容必须保存来源和版权信息；未经核实的内容不能标记为已核验。

6. 数据库变更必须通过迁移管理。

7. 使用 TypeScript strict、ESLint、Prettier 和自动化测试。

8. 不提交密钥、密码、生产数据或未经授权的媒体文件。

9. 不为尚未验证的需求引入微服务、复杂缓存或独立搜索集群。

10. 先确认需求与设计，再执行实现；涉及架构变更时先说明影响并获得确认。

## 每个功能的完成标准

* 有明确的验收条件。

* 有输入校验和错误处理。

* 需要时具备单元或集成测试。

* 公开页面具备基础 SEO 与响应式适配。

* 后台写入操作经过权限验证。

* 更新相关文档和数据库迁移。

* 本地构建和相关测试通过后才算完成。

## 20. 最终实施建议

建议将第一版定义为 Nanking Atlas 1.0：内容可持续运营的城市文化网站，而不是一次性建设庞大的城市知识图谱。

首期交付应集中在五件事：

1. 一套具有鲜明品牌气质的公开网站。

2. 一个真正可以写作、审核、发布的独立后台。

3. 一套有来源、版权、版本与关联关系的内容数据库。

4. 一张可搜索、可筛选、可联动的南京街巷地图。

5. 一套可部署、可监控、可备份、可恢复的工程体系。

品牌名 Nanking Atlas（金陵风物志） 可以作为当前开发名称继续推进。正式公开发布前，再检查商标、域名和名称冲突；英文名称保留 Nanking 的历史文化意味，中文名称负责传达产品的本土文化定位。

建议的下一步是先生成项目工程骨架与核心数据库/API 契约，再开发首页和后台内容管理 MVP。 这样可以先验证技术架构、部署方式和内容发布链路，再逐步完善地图、专题和城市档案。


