export type Movie = {
  id: string;
  title: string;
  year: number;
  dur: string;
  genre: string[];
  director: string;
  drm: boolean;
  tint: string;
  synopsis: string;
  quality: string;
  codec: string;
  featured?: boolean;
  available?: boolean;   // true = phim thật có thể phát; undefined/false = placeholder ảo
  poster?: string;       // 2:3 portrait
  backdrop?: string;     // 16:9 landscape
  manifestId?: string;
};

// Ảnh poster từ Wikimedia Commons (stable direct URLs)
const W = (path: string) => `https://upload.wikimedia.org/wikipedia/${path}`;
// Backdrop từ picsum với seed cố định (cinematic dark look)
const b = (seed: string) => `https://picsum.photos/seed/${seed}/1280/720`;

export const MOVIES: Movie[] = [

  // ── PHIM THẬT — DRM hoạt động ─────────────────────────────────────────────
  {
    id: 'aaronswartz',
    title: "The Internet's Own Boy",
    year: 2014,
    dur: '1:44:59',
    genre: ['Tài liệu', 'Lịch sử'],
    director: 'Brian Knappenberger',
    drm: true,
    tint: 'tint-blue',
    available: true,
    synopsis: 'Câu chuyện về Aaron Swartz — thiên tài lập trình, đồng tác giả RSS và Reddit, người đấu tranh không mệt mỏi cho tự do thông tin. Phim ghi lại cuộc đời và di sản của một con người đã thay đổi internet, bị truy tố bởi chính phủ Mỹ vì niềm tin vào quyền truy cập tri thức.',
    quality: '1080p / 720p / 480p',
    codec: 'H.264',
    featured: true,
    poster:   W("en/d/da/The_Internet%27s_Own_Boy.jpg"),
    backdrop: b('aaronswartz-back'),
    manifestId: 'local-movie-cenc-4period',
  },

  // ── PHIM ẢO — Tài liệu Bảo mật & Internet ────────────────────────────────
  {
    id: 'citizenfour',
    title: 'Citizenfour',
    year: 2014,
    dur: '1:54:00',
    genre: ['Tài liệu', 'Chính trị'],
    director: 'Laura Poitras',
    drm: true,
    tint: 'tint-steel',
    synopsis: 'Đạo diễn Laura Poitras và nhà báo Glenn Greenwald đến Hồng Kông năm 2013 để gặp một nguồn tin bí mật tự xưng là "Citizenfour" — người sau đó tiết lộ danh tính là Edward Snowden. Phim ghi lại trực tiếp những ngày đầu của vụ rò rỉ NSA chấn động thế giới.',
    quality: '1080p',
    codec: 'H.265',
    poster:   W('en/2/27/Citizenfour.jpg'),
    backdrop: b('citizenfour-back'),
  },
  {
    id: 'zero-days',
    title: 'Zero Days',
    year: 2016,
    dur: '1:56:00',
    genre: ['Tài liệu', 'An ninh mạng'],
    director: 'Alex Gibney',
    drm: true,
    tint: 'tint-rose',
    synopsis: 'Điều tra về Stuxnet — vũ khí mạng đầu tiên trong lịch sử được Mỹ và Israel phát triển để phá hoại chương trình hạt nhân Iran. Phim tiết lộ thế giới ngầm của chiến tranh mạng và những hệ quả không thể kiểm soát của nó.',
    quality: '1080p',
    codec: 'H.265',
    poster:   W('en/a/ab/Zero_Days_film_poster.jpg'),
    backdrop: b('zerodays-back'),
  },
  {
    id: 'we-are-legion',
    title: 'We Are Legion',
    year: 2012,
    dur: '1:33:00',
    genre: ['Tài liệu', 'Hacker'],
    director: 'Brian Knappenberger',
    drm: true,
    tint: 'tint-violet',
    synopsis: 'Nguồn gốc và sự trỗi dậy của Anonymous — tập thể hacktivism toàn cầu xuất phát từ diễn đàn 4chan, trở thành lực lượng phản kháng phi tập trung lớn nhất thế giới kỹ thuật số. Cùng đạo diễn Brian Knappenberger — người đã làm The Internet\'s Own Boy.',
    quality: '1080p',
    codec: 'H.264',
    poster:   W('en/4/44/WeAreLegion_film_poster.jpg'),
    backdrop: b('legion-back'),
  },
  {
    id: 'snowden',
    title: 'Snowden',
    year: 2016,
    dur: '2:14:00',
    genre: ['Tiểu sử', 'Chính trị'],
    director: 'Oliver Stone',
    drm: true,
    tint: 'tint-teal',
    synopsis: 'Oliver Stone tái dựng cuộc đời Edward Snowden — từ nhân viên CIA đến người đã rò rỉ hàng nghìn tài liệu mật của NSA cho thế giới biết về quy mô giám sát hàng loạt của chính phủ Mỹ. Với Joseph Gordon-Levitt trong vai chính.',
    quality: '1080p',
    codec: 'H.265',
    poster:   W('en/9/9a/Snowden_poster.jpg'),
    backdrop: b('snowden-back'),
  },

  // ── PHIM ẢO — Điện ảnh & Truyền hình ─────────────────────────────────────
  {
    id: 'mr-robot',
    title: 'Mr. Robot',
    year: 2015,
    dur: '4 mùa · 45 tập',
    genre: ['Hacker', 'Tâm lý'],
    director: 'Sam Esmail',
    drm: true,
    tint: 'tint-amber',
    synopsis: 'Elliot Alderson — kỹ sư bảo mật ban ngày, hacker cô độc ban đêm — được chiêu mộ vào nhóm bí ẩn "fsociety" với mục tiêu xóa bỏ tất cả dữ liệu nợ của tập đoàn Evil Corp, kéo sập hệ thống tài chính toàn cầu. Series được giới bảo mật đánh giá là thực tế nhất từ trước đến nay.',
    quality: '4K HDR',
    codec: 'H.265',
    poster:   W('en/4/43/Mr._Robot_Season_1_poster.jpg'),
    backdrop: b('mrrobot-back'),
  },
  {
    id: 'social-network',
    title: 'The Social Network',
    year: 2010,
    dur: '2:00:00',
    genre: ['Tiểu sử', 'Drama'],
    director: 'David Fincher',
    drm: false,
    tint: 'tint-blue',
    synopsis: 'Câu chuyện về sự ra đời của Facebook và cuộc chiến pháp lý phức tạp giữa Mark Zuckerberg và những người đồng sáng lập, bạn bè, và các nhà đầu tư. David Fincher dựng lại một trong những vụ kiện nổi tiếng nhất thế giới công nghệ.',
    quality: '1080p',
    codec: 'H.264',
    poster:   W('en/7/76/The_Social_Network_film_poster.jpg'),
    backdrop: b('socialnet-back'),
  },
  {
    id: 'matrix',
    title: 'The Matrix',
    year: 1999,
    dur: '2:16:00',
    genre: ['Khoa học viễn tưởng', 'Hành động'],
    director: 'Lana & Lilly Wachowski',
    drm: false,
    tint: 'tint-green',
    synopsis: 'Thomas Anderson — lập trình viên ban ngày, hacker Neo ban đêm — khám phá sự thật rằng thực tại mà anh đang sống chỉ là một mô phỏng máy tính. Kiệt tác điện ảnh định nghĩa lại thể loại cyberpunk và triết học về ý thức trong kỷ nguyên kỹ thuật số.',
    quality: '4K Remaster',
    codec: 'H.265',
    poster:   W('en/c/c1/The_Matrix_Poster.jpg'),
    backdrop: b('matrix-back'),
  },
  {
    id: 'wargames',
    title: 'WarGames',
    year: 1983,
    dur: '1:54:00',
    genre: ['Hacker cổ điển', 'Khoa học viễn tưởng'],
    director: 'John Badham',
    drm: false,
    tint: 'tint-steel',
    synopsis: 'Một học sinh trung học tình cờ hack vào siêu máy tính của Bộ Quốc phòng Mỹ và kích hoạt một cuộc mô phỏng chiến tranh hạt nhân mà máy tính không thể phân biệt với thực tế. Bộ phim đã thay đổi nhận thức của Nhà Trắng về an ninh mạng.',
    quality: '4K Remaster',
    codec: 'H.264',
    poster:   W('en/2/2f/Wargames.jpg'),
    backdrop: b('wargames-back'),
  },
  {
    id: 'hackers',
    title: 'Hackers',
    year: 1995,
    dur: '1:47:00',
    genre: ['Hacker cổ điển', 'Hành động'],
    director: 'Iain Softley',
    drm: false,
    tint: 'tint-rose',
    synopsis: 'Zero Cool — thiên tài 11 tuổi từng gây sập thị trường chứng khoán — trở lại thế giới hacker khi 18 tuổi và cùng nhóm bạn đối mặt với tên tội phạm mạng The Plague đang âm mưu gian lận hàng triệu đô la. Biểu tượng văn hóa hacker thập niên 90.',
    quality: '1080p Remaster',
    codec: 'H.264',
    poster:   W('en/4/40/Hackers-film-poster.jpg'),
    backdrop: b('hackers-back'),
  },
  {
    id: 'ex-machina',
    title: 'Ex Machina',
    year: 2014,
    dur: '1:48:00',
    genre: ['Khoa học viễn tưởng', 'Tâm lý'],
    director: 'Alex Garland',
    drm: false,
    tint: 'tint-teal',
    synopsis: 'Caleb Smith — lập trình viên trẻ tại công ty tìm kiếm lớn nhất thế giới — được chọn tham gia thử nghiệm Turing với Ava, một AI có ngoại hình người phụ nữ. Khi ranh giới giữa trí tuệ nhân tạo và ý thức mờ dần, câu hỏi thực sự là: ai đang kiểm tra ai?',
    quality: '4K HDR',
    codec: 'H.265',
    poster:   W('en/b/b5/Ex_Machina_%28film%29_film_poster.jpg'),
    backdrop: b('exmachina-back'),
  },
  {
    id: 'deep-web',
    title: 'Deep Web',
    year: 2015,
    dur: '1:30:00',
    genre: ['Tài liệu', 'Tội phạm mạng'],
    director: 'Alex Winter',
    drm: true,
    tint: 'tint-violet',
    synopsis: 'Câu chuyện về Silk Road — chợ đen đầu tiên trên dark web nơi giao dịch Bitcoin ẩn danh, và Ross Ulbricht (Dread Pirate Roberts) — người đã xây dựng nó và bị FBI bắt. Phim đặt câu hỏi về tự do, quy định và bản chất của internet.',
    quality: '1080p',
    codec: 'H.264',
    poster:   b('deepweb-poster'),  // picsum fallback
    backdrop: b('deepweb-back'),
  },
];

export const getMovieById = (id: string): Movie | undefined =>
  MOVIES.find((m) => m.id === id);

export const getFeaturedMovie = (): Movie =>
  MOVIES.find((m) => m.featured) ?? MOVIES[0]!;
