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
  {
    id: 'bbb',
    title: 'Big Buck Bunny',
    year: 2008,
    dur: '0:10',
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
    id: 'ed',
    title: 'Elephants Dream',
    year: 2006,
    dur: '10:53',
    genre: ['Hoạt hình', 'Trừu tượng'],
    director: 'Bassam Kurdali',
    drm: true,
    tint: 'tint-violet',
    synopsis: 'Hai nhân vật khám phá một thế giới máy móc kỳ lạ, nơi giao tiếp và niềm tin trở thành thử thách lớn nhất.',
    quality: '1080p',
    codec: 'H.264',
    manifestId: 'shaka-sintel-widevine',
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
    synopsis: 'Câu chuyện về một chú cừu cô đơn được trao cơ hội thay đổi định mệnh — qua nhiều vũ trụ song song.',
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
    synopsis: 'Chú lạc đà Llama Oscar lại tiếp tục cuộc phiêu lưu hài hước trong rừng Patagonia.',
    quality: '1080p',
    codec: 'VP9',
    manifestId: 'dash-if-bbb',
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
    synopsis: 'Một cô gái chăn cừu và con thú cưng của cô phải đối mặt với các vị thần cổ đại để giữ cho mùa xuân quay trở lại.',
    quality: '1080p',
    codec: 'AV1',
    manifestId: 'shaka-tos-widevine',
  },
];

export const getMovieById = (id: string): Movie | undefined =>
  MOVIES.find((m) => m.id === id);

export const getFeaturedMovie = (): Movie =>
  MOVIES.find((m) => m.featured) ?? MOVIES[0]!;
