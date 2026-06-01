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
  /** ID trong MOCK_MANIFESTS để load vào player */
  manifestId: string;
};

export const MOVIES: Movie[] = [
  // ── DRM-protected ─────────────────────────────────────────────────────────
  {
    id: 'bbb',
    title: 'Big Buck Bunny',
    year: 2008,
    dur: '9:56',
    genre: ['Hoạt hình', 'Hài'],
    director: 'Sacha Goedegebure',
    drm: true,
    tint: 'tint-amber',
    synopsis: 'Một chú thỏ to lớn nhưng hiền lành phải đối mặt với ba kẻ bắt nạt nhỏ con khi chúng phá huỷ tổ ấm bình yên của cậu. Cuộc phục thù được dàn dựng tinh vi và đầy bất ngờ.',
    quality: '1080p',
    codec: 'H.264',
    manifestId: 'local-cdn-sim-widevine-https',
  },
  {
    id: 'sintel',
    title: 'Sintel',
    year: 2010,
    dur: '14:48',
    genre: ['Phiêu lưu', 'Drama'],
    director: 'Colin Levy',
    drm: true,
    tint: 'tint-rose',
    synopsis: 'Một cô gái trẻ tên Sintel lên đường tìm kiếm con rồng nhỏ mà cô đã chăm sóc khi nó bị thương. Hành trình băng qua những vùng đất khắc nghiệt với cái giá đắt đỏ.',
    quality: '1080p',
    codec: 'H.265',
    featured: true,
    manifestId: 'shaka-sintel-widevine',
  },
  {
    id: 'tos',
    title: 'Tears of Steel',
    year: 2012,
    dur: '12:14',
    genre: ['Khoa học viễn tưởng'],
    director: 'Ian Hubert',
    drm: true,
    tint: 'tint-steel',
    synopsis: 'Trong tương lai gần, một nhóm chiến binh và nhà khoa học tập hợp tại Quảng trường Amsterdam để cứu thế giới khỏi sự huỷ diệt của những cỗ máy do chính họ tạo ra.',
    quality: '1080p',
    codec: 'H.265',
    manifestId: 'shaka-tos-widevine',
  },
  {
    id: 'spring',
    title: 'Spring',
    year: 2019,
    dur: '7:40',
    genre: ['Hoạt hình', 'Drama'],
    director: 'Andy Goralczyk',
    drm: true,
    tint: 'tint-blue',
    synopsis: 'Một cô gái chăn cừu và con thú cưng của cô phải đối mặt với các vị thần cổ đại để giữ cho mùa xuân quay trở lại. Bộ phim mang đậm nét thần thoại Bắc Âu.',
    quality: '1080p',
    codec: 'AV1',
    manifestId: 'shaka-tos-widevine',
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
    manifestId: 'dash-if-bbb',
  },

  // ── Nội dung mới — URLs đã kiểm tra hoạt động ────────────────────────────
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
    manifestId: 'shaka-angel-one',
  },
  {
    id: 'bien-gioi',
    title: 'Biên Giới Ánh Sáng',
    year: 2022,
    dur: '11:30',
    genre: ['Khoa học viễn tưởng', 'Drama'],
    director: 'Trần Hoàng Nam',
    drm: true,
    tint: 'tint-blue',
    synopsis: 'Năm 2087, khi con người và AI sống cùng nhau, một kỹ sư trẻ phát hiện bí mật đằng sau chương trình kiểm soát thành phố và phải đưa ra lựa chọn sinh tử. Phim được bảo vệ bằng ClearKey DRM.',
    quality: '1080p',
    codec: 'H.265',
    manifestId: 'shaka-tos-widevine',
  },
];

export const getMovieById = (id: string): Movie | undefined =>
  MOVIES.find((m) => m.id === id);

export const getFeaturedMovie = (): Movie =>
  MOVIES.find((m) => m.featured) ?? MOVIES[0]!;
