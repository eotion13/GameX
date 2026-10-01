#include "GameXMatchController.h"

void UGameXMatchController::StartMatch(int32 PlayerCount)
{
	Round = 1;
	bFinished = false;
	// Native createGame(PlayerCount) will be wired when Unreal links GameXCore.
	(void)PlayerCount;
}
