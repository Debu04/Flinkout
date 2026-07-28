import type { ActivityPoint, SocialActivity, User } from './api';

export type DemoActivity = {
  activity: SocialActivity;
  title: string;
  location: string;
  description: string;
  tags: string[];
  elevationM: number;
};

export type DemoProfile = {
  user: User;
  location: string;
  activityIds: string[];
  totalDistanceKm: number;
  streakDays: number;
};

const point = (latitude: number, longitude: number, recordedAt: string): ActivityPoint => ({
  latitude,
  longitude,
  accuracy: 8,
  altitude: null,
  speed: null,
  recordedAt,
});

const socialUser = (id: string, username: string, displayName: string) => ({
  id,
  username,
  profile: { displayName, photoUrl: null },
});

export const demoActivities: Record<string, DemoActivity> = {
  'demo-own-walk': {
    activity: {
      id: 'demo-own-walk',
      type: 'WALK',
      visibility: 'FOLLOWERS',
      startedAt: '2026-07-28T05:35:00.000Z',
      endedAt: '2026-07-28T06:09:00.000Z',
      durationS: 2040,
      distanceM: 3600,
      route: [
        point(34.0503, -118.246, '2026-07-28T05:35:00.000Z'),
        point(34.047, -118.239, '2026-07-28T05:46:00.000Z'),
        point(34.052, -118.234, '2026-07-28T05:58:00.000Z'),
        point(34.0503, -118.246, '2026-07-28T06:09:00.000Z'),
      ],
      user: socialUser('demo-marcus', 'marcus_moves', 'Marcus Rivera'),
      reactionCount: 9,
      commentCount: 2,
      reactedByViewer: false,
    },
    title: 'Sunrise Neighborhood Walk',
    location: 'Arts District Loop',
    description: 'A calm sunrise loop before the city woke up. Saved a new coffee stop for the weekend crew.',
    tags: ['MorningWalk', 'LocalLoop'],
    elevationM: 28,
  },
  'demo-run': {
    activity: {
      id: 'demo-run',
      type: 'RUN',
      visibility: 'PUBLIC',
      startedAt: '2026-07-28T06:10:00.000Z',
      endedAt: '2026-07-28T06:52:15.000Z',
      durationS: 2535,
      distanceM: 8420,
      route: [
        point(34.0522, -118.2437, '2026-07-28T06:10:00.000Z'),
        point(34.0574, -118.2382, '2026-07-28T06:19:00.000Z'),
        point(34.0612, -118.2461, '2026-07-28T06:29:00.000Z'),
        point(34.0565, -118.2538, '2026-07-28T06:41:00.000Z'),
        point(34.0522, -118.2437, '2026-07-28T06:52:15.000Z'),
      ],
      user: socialUser('demo-sienna', 'sienna_trails', 'Sienna Williams'),
      reactionCount: 24,
      commentCount: 8,
      reactedByViewer: false,
    },
    title: 'Silver Creek Tempo Run',
    location: 'Silver Creek Loop',
    description: 'Crisp morning air and quiet trails. I finally beat my best time on the ascent.',
    tags: ['MorningRun', 'TrailRun', 'SoloSession'],
    elevationM: 186,
  },
  'demo-ride': {
    activity: {
      id: 'demo-ride',
      type: 'RIDE',
      visibility: 'PUBLIC',
      startedAt: '2026-07-27T16:20:00.000Z',
      endedAt: '2026-07-27T16:48:40.000Z',
      durationS: 1720,
      distanceM: 5100,
      route: [
        point(34.046, -118.25, '2026-07-27T16:20:00.000Z'),
        point(34.049, -118.241, '2026-07-27T16:28:00.000Z'),
        point(34.055, -118.235, '2026-07-27T16:38:00.000Z'),
        point(34.061, -118.239, '2026-07-27T16:48:40.000Z'),
      ],
      user: socialUser('demo-james', 'james_moves', 'James Chen'),
      reactionCount: 12,
      commentCount: 3,
      reactedByViewer: false,
    },
    title: 'Downtown Greenway Ride',
    location: 'Downtown Greenway',
    description: "A light ride before work. The waterfront is always therapeutic. Who is out this weekend?",
    tags: ['CityRide', 'MorningMiles'],
    elevationM: 54,
  },
  'demo-walk': {
    activity: {
      id: 'demo-walk',
      type: 'WALK',
      visibility: 'PUBLIC',
      startedAt: '2026-07-26T14:15:00.000Z',
      endedAt: '2026-07-26T15:07:00.000Z',
      durationS: 3120,
      distanceM: 4200,
      route: [
        point(34.058, -118.251, '2026-07-26T14:15:00.000Z'),
        point(34.061, -118.247, '2026-07-26T14:32:00.000Z'),
        point(34.057, -118.24, '2026-07-26T14:48:00.000Z'),
        point(34.053, -118.245, '2026-07-26T15:07:00.000Z'),
      ],
      user: socialUser('demo-elena', 'elena_trails', 'Elena Rodriguez'),
      reactionCount: 31,
      commentCount: 5,
      reactedByViewer: true,
    },
    title: 'Morning Harbor Loop',
    location: 'East Side Park',
    description: 'A relaxed neighborhood loop with good company and even better weather.',
    tags: ['DailyWalk', 'TogetherOutside'],
    elevationM: 42,
  },
  'demo-hike': {
    activity: {
      id: 'demo-hike',
      type: 'HIKE',
      visibility: 'PUBLIC',
      startedAt: '2026-07-24T12:30:00.000Z',
      endedAt: '2026-07-24T14:18:00.000Z',
      durationS: 6480,
      distanceM: 7600,
      route: [
        point(34.118, -118.301, '2026-07-24T12:30:00.000Z'),
        point(34.124, -118.296, '2026-07-24T13:00:00.000Z'),
        point(34.129, -118.29, '2026-07-24T13:32:00.000Z'),
        point(34.122, -118.286, '2026-07-24T14:18:00.000Z'),
      ],
      user: socialUser('demo-henry', 'hiking_henry', 'Henry Walker'),
      reactionCount: 46,
      commentCount: 11,
      reactedByViewer: false,
    },
    title: 'Summit Ridge Hike',
    location: 'Peak Trail Entrance',
    description: 'A slow climb, wide views, and exactly the kind of quiet morning I needed.',
    tags: ['TrailDay', 'WeekendHike'],
    elevationM: 412,
  },
};

const profile = (
  id: string,
  username: string,
  displayName: string,
  bio: string,
  activityIds: string[],
  totalDistanceKm: number,
  streakDays: number,
): DemoProfile => ({
  user: {
    id,
    username,
    profile: {
      displayName,
      bio,
      photoUrl: null,
      profileVisibility: 'PUBLIC',
      routeVisibility: 'FOLLOWERS',
      discoverable: true,
    },
    isFollowing: false,
    isSelf: username === 'marcus_moves',
  },
  location: 'Los Angeles, CA',
  activityIds,
  totalDistanceKm,
  streakDays,
});

export const demoProfiles: Record<string, DemoProfile> = {
  marcus_moves: profile('demo-marcus', 'marcus_moves', 'Marcus Rivera', 'Everyday explorer, weekend trail guide, and believer that movement is better together.', ['demo-own-walk'], 842, 12),
  sienna_trails: profile('demo-sienna', 'sienna_trails', 'Sienna Williams', 'Trail runner, early starter, and collector of quiet mountain miles.', ['demo-run'], 516, 8),
  james_moves: profile('demo-james', 'james_moves', 'James Chen', 'Cyclist, city explorer, and weekend coffee-stop planner.', ['demo-ride'], 391, 5),
  elena_trails: profile('demo-elena', 'elena_trails', 'Elena Rodriguez', 'Community walk leader making space for every pace.', ['demo-walk'], 274, 16),
  trail_seeker: profile('demo-trail-seeker', 'trail_seeker', 'Tara Singh', 'Searching for scenic loops and friendly weekend groups.', [], 188, 4),
  hiking_henry: profile('demo-henry', 'hiking_henry', 'Henry Walker', 'Hiker, dog person, and careful keeper of trail notes.', ['demo-hike'], 623, 9),
};

export const demoFeed = Object.values(demoActivities).map(item => item.activity);

export function getDemoActivity(id: string): DemoActivity {
  return demoActivities[id] ?? demoActivities['demo-walk'];
}

export function getDemoProfile(username: string): DemoProfile {
  return demoProfiles[username] ?? profile(
    `demo-${username}`,
    username,
    username.split('_').map(part => part ? part[0].toUpperCase() + part.slice(1) : '').join(' '),
    'A Flinkout community member who loves moving outdoors.',
    [],
    0,
    0,
  );
}
