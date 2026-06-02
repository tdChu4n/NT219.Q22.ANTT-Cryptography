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
  available?: boolean;
  poster?: string;
  backdrop?: string;
  manifestId?: string;
};

// picsum.photos — ảnh placeholder ổn định, không bị chặn CORS
const p = (id: number) => `https://picsum.photos/id/${id}/400/600`;
const b = (id: number) => `https://picsum.photos/id/${id}/1280/720`;

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
    poster:   p(11),
    backdrop: b(42),
    manifestId: 'local-movie-cenc-4period',
  },

  // ── Tài liệu Bảo mật & Internet ──────────────────────────────────────────
  {
    id: 'citizenfour',
    title: 'Citizenfour',
    year: 2014,
    dur: '1:54',
    genre: ['Tài liệu', 'Chính trị'],
    director: 'Laura Poitras',
    drm: true,
    tint: 'tint-steel',
    synopsis: 'Đạo diễn Laura Poitras và nhà báo Glenn Greenwald đến Hồng Kông năm 2013 để gặp một nguồn tin bí mật tự xưng là "Citizenfour" — sau đó tiết lộ là Edward Snowden. Phim ghi lại trực tiếp những ngày đầu của vụ rò rỉ NSA chấn động thế giới.',
    quality: '1080p',
    codec: 'H.265',
    poster:   p(26),
    backdrop: b(65),
  },
  {
    id: 'zero-days',
    title: 'Zero Days',
    year: 2016,
    dur: '1:56',
    genre: ['Tài liệu', 'An ninh mạng'],
    director: 'Alex Gibney',
    drm: true,
    tint: 'tint-rose',
    synopsis: 'Điều tra về Stuxnet — vũ khí mạng đầu tiên trong lịch sử được Mỹ và Israel phát triển để phá hoại chương trình hạt nhân Iran. Phim tiết lộ thế giới ngầm của chiến tranh mạng và những hệ quả không thể kiểm soát của nó.',
    quality: '1080p',
    codec: 'H.265',
    poster:   p(28),
    backdrop: b(99),
  },
  {
    id: 'we-are-legion',
    title: 'We Are Legion',
    year: 2012,
    dur: '1:33',
    genre: ['Tài liệu', 'Hacktivism'],
    director: 'Brian Knappenberger',
    drm: true,
    tint: 'tint-violet',
    synopsis: 'Nguồn gốc và sự trỗi dậy của Anonymous — tập thể hacktivism toàn cầu xuất phát từ 4chan, trở thành lực lượng phản kháng phi tập trung lớn nhất thế giới kỹ thuật số.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p(55),
    backdrop: b(164),
  },
  {
    id: 'snowden',
    title: 'Snowden',
    year: 2016,
    dur: '2:14',
    genre: ['Tiểu sử', 'Chính trị'],
    director: 'Oliver Stone',
    drm: true,
    tint: 'tint-teal',
    synopsis: 'Oliver Stone tái dựng cuộc đời Edward Snowden — từ nhân viên CIA đến người đã rò rỉ hàng nghìn tài liệu mật của NSA. Với Joseph Gordon-Levitt trong vai chính.',
    quality: '1080p',
    codec: 'H.265',
    poster:   p(64),
    backdrop: b(177),
  },
  {
    id: 'deep-web',
    title: 'Deep Web',
    year: 2015,
    dur: '1:30',
    genre: ['Tài liệu', 'Tội phạm mạng'],
    director: 'Alex Winter',
    drm: true,
    tint: 'tint-violet',
    synopsis: 'Câu chuyện về Silk Road — chợ đen đầu tiên trên dark web nơi giao dịch Bitcoin ẩn danh, và Ross Ulbricht — người đã xây dựng nó và bị FBI bắt.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p(121),
    backdrop: b(190),
  },

  // ── Điện ảnh & Truyền hình ────────────────────────────────────────────────
  {
    id: 'mr-robot',
    title: 'Mr. Robot',
    year: 2015,
    dur: '4 mùa · 45 tập',
    genre: ['Hacker', 'Tâm lý'],
    director: 'Sam Esmail',
    drm: true,
    tint: 'tint-amber',
    synopsis: 'Elliot Alderson — kỹ sư bảo mật ban ngày, hacker cô độc ban đêm — được chiêu mộ vào nhóm bí ẩn "fsociety" với mục tiêu xóa bỏ tất cả dữ liệu nợ của tập đoàn Evil Corp. Series được giới bảo mật đánh giá là thực tế nhất từ trước đến nay.',
    quality: '4K HDR',
    codec: 'H.265',
    poster:   p(177),
    backdrop: b(213),
  },
  {
    id: 'social-network',
    title: 'The Social Network',
    year: 2010,
    dur: '2:00',
    genre: ['Tiểu sử', 'Drama'],
    director: 'David Fincher',
    drm: false,
    tint: 'tint-blue',
    synopsis: 'Câu chuyện về sự ra đời của Facebook và cuộc chiến pháp lý phức tạp giữa Mark Zuckerberg và những người đồng sáng lập, bạn bè, và các nhà đầu tư.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p(239),
    backdrop: b(247),
  },
  {
    id: 'matrix',
    title: 'The Matrix',
    year: 1999,
    dur: '2:16',
    genre: ['Khoa học viễn tưởng', 'Hành động'],
    director: 'Lana & Lilly Wachowski',
    drm: false,
    tint: 'tint-green',
    synopsis: 'Thomas Anderson — lập trình viên ban ngày, hacker Neo ban đêm — khám phá sự thật rằng thực tại mà anh đang sống chỉ là một mô phỏng máy tính. Kiệt tác điện ảnh định nghĩa lại thể loại cyberpunk.',
    quality: '4K Remaster',
    codec: 'H.265',
    poster:   p(255),
    backdrop: b(29),
  },
  {
    id: 'wargames',
    title: 'WarGames',
    year: 1983,
    dur: '1:54',
    genre: ['Hacker cổ điển', 'Khoa học viễn tưởng'],
    director: 'John Badham',
    drm: false,
    tint: 'tint-steel',
    synopsis: 'Một học sinh trung học tình cờ hack vào siêu máy tính của Bộ Quốc phòng Mỹ và kích hoạt một cuộc mô phỏng chiến tranh hạt nhân. Bộ phim đã thay đổi nhận thức của Nhà Trắng về an ninh mạng.',
    quality: '4K Remaster',
    codec: 'H.264',
    poster:   p(290),
    backdrop: b(317),
  },
  {
    id: 'hackers',
    title: 'Hackers',
    year: 1995,
    dur: '1:47',
    genre: ['Hacker cổ điển', 'Hành động'],
    director: 'Iain Softley',
    drm: false,
    tint: 'tint-rose',
    synopsis: 'Zero Cool — thiên tài 11 tuổi từng gây sập thị trường chứng khoán — trở lại thế giới hacker khi 18 tuổi và cùng nhóm bạn đối mặt với tên tội phạm mạng The Plague. Biểu tượng văn hóa hacker thập niên 90.',
    quality: '1080p Remaster',
    codec: 'H.264',
    poster:   p(312),
    backdrop: b(325),
  },
  {
    id: 'ex-machina',
    title: 'Ex Machina',
    year: 2014,
    dur: '1:48',
    genre: ['Khoa học viễn tưởng', 'Tâm lý'],
    director: 'Alex Garland',
    drm: false,
    tint: 'tint-teal',
    synopsis: 'Caleb Smith — lập trình viên trẻ — được chọn tham gia thử nghiệm Turing với Ava, một AI có ngoại hình người phụ nữ. Khi ranh giới giữa trí tuệ nhân tạo và ý thức mờ dần, câu hỏi thực sự là: ai đang kiểm tra ai?',
    quality: '4K HDR',
    codec: 'H.265',
    poster:   p(366),
    backdrop: b(379),
  },
];

export const getMovieById = (id: string): Movie | undefined =>
  MOVIES.find((m) => m.id === id);

export const getFeaturedMovie = (): Movie =>
  MOVIES.find((m) => m.featured) ?? MOVIES[0]!;
