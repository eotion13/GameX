#include "GameXGameMode.h"
#include "GameXStrategyCamera.h"

AGameXGameMode::AGameXGameMode()
{
	DefaultPawnClass = AGameXStrategyCamera::StaticClass();
}
