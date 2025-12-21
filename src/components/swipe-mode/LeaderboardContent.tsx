import { useEffect } from 'react';
import { useSubscriberScores } from '@/hooks/useSubscriberScores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Flame, Heart, Medal } from 'lucide-react';

interface LeaderboardDrawerContentProps {
  topicId: string;
  topicName: string;
}

export function LeaderboardContent({ topicId, topicName }: LeaderboardDrawerContentProps) {
  const { score, leaderboard, loading, isVerifiedSubscriber, fetchScore, fetchLeaderboard } = useSubscriberScores(topicId);

  useEffect(() => {
    fetchLeaderboard();
    if (isVerifiedSubscriber) {
      fetchScore();
    }
  }, [fetchLeaderboard, fetchScore, isVerifiedSubscriber]);

  if (!isVerifiedSubscriber) {
    return (
      <div className="p-6 text-center space-y-4">
        <Trophy className="w-12 h-12 mx-auto text-muted-foreground" />
        <div>
          <h3 className="font-semibold">Subscriber Perk</h3>
          <p className="text-sm text-muted-foreground">
            Subscribe to the briefing to unlock score tracking and leaderboards!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Your Stats */}
      {score && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{score.totalSwipes}</div>
                <div className="text-xs text-muted-foreground">Total Swipes</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{score.likeCount}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Heart className="w-3 h-3" /> Likes
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-500">{score.bestStreak}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Flame className="w-3 h-3" /> Best Streak
                </div>
              </div>
            </div>
            <div className="mt-3 text-center text-xs text-muted-foreground">
              {score.sessionsPlayed} session{score.sessionsPlayed !== 1 ? 's' : ''} played
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          {topicName} Leaderboard
        </h3>
        
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No scores yet. Be the first!
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div 
                key={entry.email}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  index === 0 ? 'bg-yellow-500/10 border border-yellow-500/20' :
                  index === 1 ? 'bg-gray-400/10 border border-gray-400/20' :
                  index === 2 ? 'bg-orange-600/10 border border-orange-600/20' :
                  'bg-muted/50'
                }`}
              >
                <div className="w-6 text-center font-bold">
                  {index === 0 ? <Medal className="w-5 h-5 text-yellow-500" /> :
                   index === 1 ? <Medal className="w-5 h-5 text-gray-400" /> :
                   index === 2 ? <Medal className="w-5 h-5 text-orange-600" /> :
                   <span className="text-muted-foreground">{index + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{entry.displayName}</div>
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span>{entry.totalSwipes} swipes</span>
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-orange-500" />
                      {entry.bestStreak}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary">
                  <Heart className="w-3 h-3 mr-1 fill-primary text-primary" />
                  {entry.likeCount}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
