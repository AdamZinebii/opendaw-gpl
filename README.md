# openDAW

**openDAW** is a next-generation web-based Digital Audio Workstation (DAW) designed to **democratize** music production
and to **resurface the process of making music** by making **high-quality** creation tools accessible to everyone, with
a strong focus on **education** and hands-on **learning**.

For more information about our mission and goals, please join our [Discord](https://discord.opendaw.studio), visit
our [official website](https://opendaw.org) and test our current [prototype](https://opendaw.studio/). 

Please consider supporting this project on [Patreon](https://www.patreon.com/join/openDAW) or [ko-fi](https://ko-fi.com/opendaw)

![studio-teaser.png](assets/studio-teaser.png)

## Open-Source

We are committed to transparency and community-driven development. 

The source code for openDAW is available under GPL3 (links below).

### Built on Trust and Transparency

**openDAW stands for radical simplicity and respect.**

- **No SignUp**
- **No Tracking**
- **No Cookie Banners**
- **No User Profiling**
- **No Terms & Conditions**
- **No Ads**
- **No Paywalls**
- **No Data Mining**

**Just a free, open-source DAW in your browser.**

## Huge Shoutout To The Incredible openDAW Community!

To everyone who has contributed feedback, reported bugs, suggested improvements, or helped spread the word — thank you!
Your support is shaping openDAW into something truly powerful!

Thank
you [@ccswdavidson](https://github.com/ccswdavidson), [@Chaosmeister](https://github.com/Chaosmeister), [@jeffreylouden](https://github.com/jeffreylouden), [@solsos](https://github.com/solsos), [@TheRealSyler](https://github.com/TheRealSyler), [@Trinitou](https://github.com/Trinitou),
and [@xnstad](https://github.com/xnstad) for testing the repositories and identifying issues during the installation of
openDAW!

Special shout-out to the biggest bug hunters: [kanaris](https://kanaris.net/)
and [BeatMax Prediction](https://linktr.ee/beatmax_prediction). Your relentless attention to detail made a huge
difference!

Huge thanks to our [ambassadors](https://opendaw.org/ambassadors), whose dedication and outreach amplify our mission!

## And big hugs to all our supporters!

### openDAW Visionary — $25.00  
- Polarity
- kanaris  
- Stephen Tai  
- Thad Guidry  
- Pathfinder  
- One Sound Every Day (santino)

### openDAW Supporter — $5.00  
- Cal Lycus  
- Jetdarc  
- Truls Enstad  
- p07a  
- Ynot Etluhcs  
- Mats Gisselson  
- Dado  
- centomila  
- Ola  
- SKYENCE  
- BeatMax_Prediction  
- Kim T  
- Nyenoidz  
- Bruce Hunter  
- Steve Meiers  
- 4ohm  
- Yito  
- Shawn Lukas  
- Tommes  
- David Thompson  
- Harry Gillich

### openDAW Custom Pledge
- lokomotywa ($2.47)

---

### Repositories

* [openDAW](https://github.com/andremichelle/opendaw)

### Prepare, Clone, Installation, and Run

openDAW tries to avoid external libraries and frameworks. Following is a list of the internal core libraries and their
dependencies. This is a list of the external libraries we currently use in the web studio:

* [jszip](https://www.npmjs.com/package/jszip) (for openDAW project bundle file)
* [markdown-it](https://www.npmjs.com/package/markdown-it) + [markdown-it-table](https://www.npmjs.com/package/markdown-it-table) (for help pages)

Before starting, ensure you have the following installed on your system:

- [Git](https://git-scm.com/) is required for cloning the repository and managing submodules.
- [mkcert](https://github.com/FiloSottile/mkcert#installation) is required to create a certificate for developing with
  https protocol.
- [Node.js](nodejs.org) version **>= 23**. This is necessary for running the development server and installing
  dependencies.
- [Sass](https://sass-lang.com/) While Sass is handled internally during the development process, you will need to
  ensure you have the
  binaries available in your environment if used outside the build system.
- [TypeScript](https://www.typescriptlang.org/)
- [OpenSSL](https://chocolatey.org/) For generating local development certificates (), OpenSSL needs to be installed on
  your system. Most Linux/macOS systems have OpenSSL pre-installed.

### Clone

`git clone https://github.com/andremichelle/opendaw.git && cd opendaw`

### Installation

* `npm run cert` (only for the very first time)
* `npm run clean` (to revert to clean slate, removes all `node_modules` and `dist` folders)
* `npm install` (for the first time and after `npm run clean`)
* `npm run build` (for the first time and after `npm run clean`)
* `npm run dev:studio` | `npm run dev:headless` (start dev server)
* Navigate to https://localhost:8080 (port is important > cors sample api)

### Flow Charts

<img width="6551" height="5971" alt="image" src="https://github.com/user-attachments/assets/09aaf742-6175-42ba-946b-a66e5f5dac72" />

---

[![Custom Caption: Watch the Demo](https://img.youtube.com/vi/VPTXeJY6Eaw/0.jpg)](https://www.youtube.com/watch?v=VPTXeJY6Eaw)

Watch Polarity's Video *"there's a new FREE DAW in town"*

## Get Involved

We welcome contributions from developers, musicians, educators, and enthusiasts. To learn more about how you can
participate, visit our [Contribute](https://opendaw.org/contribute) page.

### What We Are Looking For:

1. **Offline desktop build (e.g., via Tauri) or a standalone installable PWA** — offer offline capability.
2. **Cloud-agnostic project storage** — a facade layer that lets users plug in different cloud services (e.g., Drive,
   S3, Dropbox) for projects and sample libraries.
3. **Live remote collaboration** — real-time session sharing and sync so multiple users can edit the same project
   concurrently.
4. **AI manual assistant** — an embedded agent that answers context-aware questions and guides users through features as
   they work.
5. **AI-powered stem splitting** — integrated source-separation to extract vocals, drums, and other stems directly
   inside the DAW.
6. **Import and Export** - Contribute every possible file format IO

## Links

* [opendaw.studio (prototype)](https://opendaw.studio)
* [opendaw.org (website)](https://opendaw.org)
* [openDAW on Discord](https://discord.opendaw.studio)
* [openDAW SDK](https://www.npmjs.com/org/opendaw)
* [openDAW on Patreon](https://www.patreon.com/join/openDAW)
* [openDAW on ko-fi](https://ko-fi.com/opendaw)
* [LinkedIn](https://www.linkedin.com/company/opendaw-org/)
* [Instagram](https://www.instagram.com/opendaw.studio)

## Dual-Licensing Model

openDAW is available **under two alternative license terms**:

| Option                    | When to choose it                                                                                              | Obligations                                                                                                                                                                      |
|---------------------------|----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A. GPL v3 (or later)**  | You are happy for the entire work that includes openDAW to be released under GPL-compatible open-source terms. | – Must distribute complete corresponding source code under GPL.<br>– Must keep copyright & licence notices.<br>– May run openDAW privately in any software, open or closed (§0). |
| **B. Commercial Licence** | You wish to incorporate openDAW into **closed-source** or otherwise licence-incompatible software.             | – Pay the agreed fee.<br>– No copyleft requirement for your own source code.<br>– Other terms as per the signed agreement.                                                       |

> **How to obtain the Commercial License**  
> Email `andre.michelle@opendaw.org` with your company name, product description, and expected distribution volume.

If you redistribute openDAW or a derivative work **without** a commercial license, the GPL v3 terms apply automatically.

## License

[GPL v3](https://www.gnu.org/licenses/gpl-3.0.txt) © 2025 André Michelle
