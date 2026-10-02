using UnrealBuildTool;
using System.IO;

public class GameX : ModuleRules
{
	public GameX(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		bEnableExceptions = true;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"UMG",
			"Slate",
			"SlateCore"
		});

		// Portable rules library (no UE types) — relative to this module.
		string CoreRoot = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "..", "..", "native", "GameXCore"));
		PublicIncludePaths.Add(Path.Combine(CoreRoot, "include"));
		PrivateIncludePaths.Add(Path.Combine(CoreRoot, "src"));
		PublicDefinitions.Add("GAMEX_WITH_NATIVE_CORE=1");
	}
}
