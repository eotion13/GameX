using UnrealBuildTool;
using System.IO;

public class GameX : ModuleRules
{
	public GameX(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		bEnableExceptions = true;
		bUseUnity = false;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"UMG",
			"Slate",
			"SlateCore"
		});

		// Headers for portable GameXCore (implementation lives in Source/GameX/Native).
		string CoreRoot = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "..", "..", "native", "GameXCore"));
		PublicIncludePaths.Add(Path.Combine(CoreRoot, "include"));
		PublicDefinitions.Add("GAMEX_WITH_NATIVE_CORE=1");
	}
}
