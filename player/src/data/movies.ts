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
  poster?: string;    // 2:3 portrait — URL ảnh bìa
  backdrop?: string;  // 16:9 landscape — URL ảnh nền hero/detail
  manifestId: string;
};

// picsum.photos/seed/{seed}/{w}/{h} → ảnh đẹp, cố định theo seed
const p = (seed: string) => `https://picsum.photos/seed/${seed}/400/600`;
const b = (seed: string) => `https://picsum.photos/seed/${seed}/1280/720`;

export const MOVIES: Movie[] = [
  // ── DRM-protected — Phim thật, CENC 4-period key rotation ────────────────
  {
    id: 'aaronswartz',
    title: 'The Internet\'s Own Boy',
    year: 2014,
    dur: '1:44:59',
    genre: ['Tài liệu', 'Lịch sử'],
    director: 'Brian Knappenberger',
    drm: true,
    tint: 'tint-blue',
    synopsis: 'Câu chuyện về Aaron Swartz — thiên tài lập trình, đồng tác giả RSS và Reddit, người đấu tranh không mệt mỏi cho tự do thông tin. Phim ghi lại cuộc đời và di sản của một con người đã thay đổi internet, bị truy tố bởi chính phủ vì niềm tin vào quyền truy cập tri thức. Phim sử dụng CENC AES-128-CTR với 4-period key rotation, phục vụ qua CDN nginx, cấp phép qua License Server NT219.',
    quality: '1080p / 720p / 480p',
    codec: 'H.264',
    featured: true,
    poster:   p('aaronswartz-poster'),
    backdrop: b('aaronswartz-back'),
    manifestId: 'local-movie-cenc-4period',
  },

  // ── Clear / miễn phí ──────────────────────────────────────────────────────
  {
    id: 'ed',
    title: 'Elephants Dream',
    year: 2006,
    dur: '10:53',
    genre: ['Hoạt hình', 'Trừu tượng'],
    director: 'Bassam Kurdali',
    drm: false,
    tint: 'tint-violet',
    synopsis: 'Hai nhân vật khám phá một thế giới máy móc kỳ lạ, nơi giao tiếp và niềm tin trở thành thử thách lớn nhất. Bộ phim mã nguồn mở đầu tiên của Blender Foundation.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p('ed-poster'),
    backdrop: b('ed-back'),
    manifestId: 'shaka-elephants-clear',
  },
  {
    id: 'cosmos',
    title: 'Cosmos Laundromat',
    year: 2015,
    dur: '12:14',
    genre: ['Hoạt hình', 'Phiêu lưu'],
    director: 'Mathieu Auvray',
    drm: false,
    tint: 'tint-teal',
    synopsis: 'Câu chuyện về một chú cừu cô đơn được trao cơ hội thay đổi định mệnh — qua nhiều vũ trụ song song. Một bộ phim triết học ẩn sau lớp hoạt hình đầy màu sắc.',
    quality: '720p',
    codec: 'H.264',
    poster:   p('cosmos-poster'),
    backdrop: b('cosmos-back'),
    manifestId: 'shaka-angel-one',
  },
  {
    id: 'caminandes',
    title: 'Caminandes 3',
    year: 2016,
    dur: '2:30',
    genre: ['Hoạt hình', 'Hài'],
    director: 'Pablo Vázquez',
    drm: false,
    tint: 'tint-green',
    synopsis: 'Chú lạc đà Llama Oscar lại tiếp tục cuộc phiêu lưu hài hước trong rừng Patagonia, lần này đối mặt với kẻ thù bé nhỏ nhưng cực kỳ nguy hiểm.',
    quality: '1080p',
    codec: 'VP9',
    poster:   p('caminandes-poster'),
    backdrop: b('caminandes-back'),
    manifestId: 'dash-if-bbb',
  },
  {
    id: 'motion',
    title: 'Tự Do',
    year: 2013,
    dur: '3:36',
    genre: ['Hành động', 'Tài liệu'],
    director: 'Erik Anders Lang',
    drm: false,
    tint: 'tint-amber',
    synopsis: 'Một vũ công đường phố trổ tài parkour trên những mái nhà và con hẻm của thành phố châu Âu. Lời tuyên ngôn về tự do, cơ thể và không gian đô thị — không cần một câu thoại nào.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p('motion-poster'),
    backdrop: b('motion-back'),
    manifestId: 'bitmovin-art-motion',
  },
  {
    id: 'uke',
    title: 'Giai Điệu Mùa Hè',
    year: 2014,
    dur: '4:20',
    genre: ['Âm nhạc', 'Drama'],
    director: 'James R. Smith',
    drm: false,
    tint: 'tint-teal',
    synopsis: 'Bản nhạc ukulele dịu dàng về tình yêu và sự cô đơn giữa một thành phố ồn ào. Phim không lời thoại — chỉ có âm nhạc và hình ảnh chậm rãi kể câu chuyện.',
    quality: '720p',
    codec: 'H.264',
    poster:   p('uke-poster'),
    backdrop: b('uke-back'),
    manifestId: 'shaka-dig-uke',
  },
  {
    id: 'bbb-dark',
    title: 'Đồng Cỏ Tối',
    year: 2020,
    dur: '9:56',
    genre: ['Hoạt hình', 'Kinh dị nhẹ'],
    director: 'Sacha Goedegebure',
    drm: false,
    tint: 'tint-steel',
    synopsis: 'Phiên bản tái bản của Big Buck Bunny với bảng màu tối và ánh sáng drama — khám phá mặt tối của vùng đồng cỏ yên bình qua con mắt của kẻ săn mồi bí ẩn.',
    quality: '1080p',
    codec: 'H.265',
    poster:   p('bbbdark-poster'),
    backdrop: b('bbbdark-back'),
    manifestId: 'shaka-bbb-dark',
  },
  {
    id: 'sintel-free',
    title: 'Sintel: Bản Không Khoá',
    year: 2010,
    dur: '14:48',
    genre: ['Phiêu lưu', 'Drama'],
    director: 'Colin Levy',
    drm: false,
    tint: 'tint-rose',
    synopsis: 'Phiên bản Sintel dành cho người dùng miễn phí — không cần DRM license. Cùng hành trình, cùng cảm xúc với bản gốc, nhưng mọi khung hình đều không được mã hoá.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p('sintelfree-poster'),
    backdrop: b('sintelfree-back'),
    manifestId: 'shaka-sintel-clear',
  },
  {
    id: 'khoang-lanh',
    title: 'Khoảng Lặng',
    year: 2018,
    dur: '8:12',
    genre: ['Drama', 'Nghệ thuật'],
    director: 'Nguyễn Minh Tuấn',
    drm: false,
    tint: 'tint-violet',
    synopsis: 'Một người đàn ông lang thang qua những con phố vắng của Hà Nội lúc bình minh, đối mặt với ký ức và những lựa chọn chưa bao giờ được thực hiện. Phim tài liệu thể nghiệm.',
    quality: '1080p',
    codec: 'H.264',
    poster:   p('khoanglanh-poster'),
    backdrop: b('khoanglanh-back'),
    manifestId: 'shaka-angel-one',
  },
];

export const getMovieById = (id: string): Movie | undefined =>
  MOVIES.find((m) => m.id === id);

export const getFeaturedMovie = (): Movie =>
  MOVIES.find((m) => m.featured) ?? MOVIES[0]!;
