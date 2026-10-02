#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "GameXMatchController.generated.h"

/**
 * Bridge between Unreal presentation and GameXCore.
 *
 * Contract:
 * - Collect secret orders locally (never reveal peers early).
 * - Call native resolve exactly once per round when all orders are in.
 * - Drive animations from the returned event list / post-resolve state.
 * - Animations MUST NOT decide combat outcomes.
 */
UCLASS(BlueprintType)
class GAMEX_API UGameXMatchController : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "GameX")
	void StartMatch(int32 PlayerCount);

	UFUNCTION(BlueprintCallable, Category = "GameX")
	bool HasFinished() const { return bFinished; }

	UFUNCTION(BlueprintCallable, Category = "GameX")
	int32 GetRound() const { return Round; }

protected:
	UPROPERTY(VisibleAnywhere, Category = "GameX")
	int32 Round = 1;

	UPROPERTY(VisibleAnywhere, Category = "GameX")
	bool bFinished = false;

	// Opaque native state lives in Non-UObject storage (impl .cpp once UE links GameXCore).
};
